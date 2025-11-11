from fastapi import (
    FastAPI,
    Depends,
    HTTPException,
    status,
    Query,
    Request,
)
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel
import requests
import os
import datetime
import hashlib
import jwt
import sqlite3
from dotenv import load_dotenv
from typing import Optional
from contextlib import asynccontextmanager

# ----------------- ENV & CONFIG -----------------

load_dotenv()

DB_PATH = os.getenv("DB_PATH", "/data/app.db")
print(f"[INIT] Using database at {DB_PATH}")

MAM_COOKIE = os.getenv("MAM_COOKIE")
MAM_BASE = os.getenv("MAM_BASE", "https://www.myanonamouse.net")

QBITTORRENT_URL = os.getenv("QBITTORRENT_URL")
QBITTORRENT_USER = os.getenv("QBITTORRENT_USER")
QBITTORRENT_PASS = os.getenv("QBITTORRENT_PASS")
QBITTORRENT_SAVEPATH = os.getenv("QBITTORRENT_SAVEPATH", "/media/audiobooks")

JWT_SECRET = os.getenv("JWT_SECRET", "change_this_secret_key")
JWT_ALGO = os.getenv("JWT_ALGO", "HS256")
INVITE_CODE = os.getenv("INVITE_CODE", "invite-only-secret")

DISCORD_WEBHOOK = os.getenv("DISCORD_WEBHOOK", "").strip()

if not MAM_COOKIE:
    print("[WARN] MAM_COOKIE is not set in .env")
if not QBITTORRENT_URL:
    print("[WARN] QBITTORRENT_URL is not set in .env")
if DISCORD_WEBHOOK:
    print("[INIT] Discord webhook enabled")
else:
    print("[INIT] Discord webhook not configured")


# ----------------- DB INIT -----------------

def init_db():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    # users table
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            created_at TEXT NOT NULL
        )
        """
    )

    # covers cache table: one row per (title, author)
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS covers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            author TEXT,
            cover_url TEXT,
            updated_at TEXT NOT NULL,
            UNIQUE(title, author)
        )
        """
    )

    conn.commit()
    conn.close()
    print("[INIT] Database ready at", DB_PATH)


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


# ----------------- APP -----------------

app = FastAPI(title="MAM WebApp API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # handled by proxy; open here for simplicity
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS", "PUT", "DELETE"],
    allow_headers=["Authorization", "Content-Type", "Accept"],
)

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/login")


# ----------------- HELPERS -----------------

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode("utf-8")).hexdigest()


def verify_password(password: str, password_hash: str) -> bool:
    return hash_password(password) == password_hash


def create_token(username: str) -> str:
    payload = {
        "sub": username,
        "exp": datetime.datetime.utcnow() + datetime.timedelta(days=7),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)


def decode_token(token: str) -> str:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
        return payload.get("sub")
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")


def get_user_by_username(username: str):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT * FROM users WHERE username = ?", (username,))
    row = cur.fetchone()
    conn.close()
    return row


def create_user(username: str, password: str):
    conn = get_db()
    cur = conn.cursor()
    try:
        cur.execute(
            "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
            (username, hash_password(password), datetime.datetime.utcnow().isoformat()),
        )
        conn.commit()
    except sqlite3.IntegrityError:
        raise HTTPException(status_code=400, detail="Username already exists")
    finally:
        conn.close()


def mam_headers():
    return {
        "Cookie": MAM_COOKIE or "",
        "User-Agent": "Mozilla/5.0",
    }


def cache_get_cover(title: str, author: str) -> Optional[str]:
    """Return cached cover if present and reasonably fresh."""
    conn = get_db()
    cur = conn.cursor()
    cur.execute(
        "SELECT cover_url, updated_at FROM covers WHERE title = ? AND IFNULL(author,'') = ?",
        (title, author or ""),
    )
    row = cur.fetchone()
    conn.close()

    if not row:
        return None

    cover_url, updated_at = row
    # optional: TTL; currently always trust cached if exists
    if cover_url:
        return cover_url
    return None


def cache_set_cover(title: str, author: str, cover_url: Optional[str]):
    conn = get_db()
    cur = conn.cursor()
    cur.execute(
        """
        INSERT INTO covers (title, author, cover_url, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(title, author) DO UPDATE SET
            cover_url = excluded.cover_url,
            updated_at = excluded.updated_at
        """,
        (
            title,
            author or "",
            cover_url,
            datetime.datetime.utcnow().isoformat(),
        ),
    )
    conn.commit()
    conn.close()


def find_cover(title: str, author: str) -> Optional[str]:
    """
    Try iTunes audiobooks first, then Google Books, then OpenLibrary.
    Cache result in app.db.
    """
    title = (title or "").strip()
    author = (author or "").strip()

    if not title:
        return None

    # 1) Cache
    cached = cache_get_cover(title, author)
    if cached:
        return cached

    query = f"{title} {author} audiobook".strip()

    # 2) iTunes Search (audiobooks)
    try:
        it_res = requests.get(
            "https://itunes.apple.com/search",
            params={"term": query, "media": "audiobook", "limit": 1},
            timeout=5,
        )
        if it_res.ok:
            j = it_res.json()
            if j.get("resultCount"):
                art = j["results"][0].get("artworkUrl100") or j["results"][0].get("artworkUrl60")
                if art:
                    # upgrade size if possible
                    # common pattern: .../100x100bb.jpg -> /600x600bb.jpg
                    cover_url = art.replace("100x100", "600x600").replace("60x60", "600x600")
                    cache_set_cover(title, author, cover_url)
                    print(f"[COVER] {title} → iTunes")
                    return cover_url
    except Exception:
        pass

    # 3) Google Books
    try:
        gb = requests.get(
            "https://www.googleapis.com/books/v1/volumes",
            params={"q": query, "maxResults": 1},
            timeout=5,
        )
        if gb.ok:
            j = gb.json()
            if j.get("items"):
                links = j["items"][0]["volumeInfo"].get("imageLinks", {})
                cover_url = links.get("thumbnail") or links.get("smallThumbnail")
                if cover_url:
                    # Make sure it's https
                    if cover_url.startswith("http://"):
                        cover_url = "https://" + cover_url[len("http://") :]
                    cache_set_cover(title, author, cover_url)
                    print(f"[COVER] {title} → Google Books")
                    return cover_url
    except Exception:
        pass

    # 4) OpenLibrary
    try:
        ol = requests.get(
            "https://openlibrary.org/search.json",
            params={"title": title},
            timeout=5,
        )
        if ol.ok:
            j = ol.json()
            docs = j.get("docs", [])
            if docs:
                cover_id = docs[0].get("cover_i")
                if cover_id:
                    cover_url = f"https://covers.openlibrary.org/b/id/{cover_id}-L.jpg"
                    cache_set_cover(title, author, cover_url)
                    print(f"[COVER] {title} → OpenLibrary")
                    return cover_url
    except Exception:
        pass

    # Cache negative result to avoid hammering
    cache_set_cover(title, author, None)
    print(f"[COVER] {title} → none")
    return None


def send_discord_notification(user: str, tid: int, title: Optional[str] = None):
    if not DISCORD_WEBHOOK:
        return
    try:
        content = {
            "username": "MAM Library",
            "embeds": [
                {
                    "title": "📚 Torrent sent to qBittorrent",
                    "description": (
                        f"**User:** `{user}`\n"
                        f"**Torrent ID:** `{tid}`"
                        + (f"\n**Title:** {title}" if title else "")
                    ),
                    "color": 0xE91E63,
                }
            ],
        }
        requests.post(DISCORD_WEBHOOK, json=content, timeout=5)
    except Exception as e:
        print(f"[WEBHOOK] Failed to send Discord notification: {e}")


# ----------------- MODELS -----------------

class RegisterRequest(BaseModel):
    username: str
    password: str
    invite_code: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class AddTorrentRequest(BaseModel):
    tid: int


# ----------------- AUTH -----------------

def get_current_user(token: str = Depends(oauth2_scheme)):
    username = decode_token(token)
    if not username:
        raise HTTPException(status_code=401, detail="Invalid authentication")
    user = get_user_by_username(username)
    if not user:
        raise HTTPException(status_code=401, detail="User no longer exists")
    return user


# ----------------- ROUTES -----------------

@app.get("/api/test")
def api_test():
    return {"status": "ok"}


@app.post("/api/register", response_model=TokenResponse)
def register(data: RegisterRequest):
    if data.invite_code != INVITE_CODE:
        raise HTTPException(status_code=403, detail="Invalid invite code")
    if len(data.username) < 3 or len(data.password) < 4:
        raise HTTPException(status_code=400, detail="Username or password too short")
    create_user(data.username, data.password)
    token = create_token(data.username)
    return TokenResponse(access_token=token)


@app.post("/api/login", response_model=TokenResponse)
async def login(request: Request):
    content_type = request.headers.get("content-type", "")
    username = password = None

    if "application/x-www-form-urlencoded" in content_type or "multipart/form-data" in content_type:
        form = await request.form()
        username = form.get("username")
        password = form.get("password")
    else:
        try:
            body = await request.json()
        except Exception:
            body = {}
        username = body.get("username")
        password = body.get("password")

    if not username or not password:
        raise HTTPException(status_code=400, detail="Username and password required")

    user = get_user_by_username(username)
    if not user or not verify_password(password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid username or password")

    token = create_token(username)
    return TokenResponse(access_token=token)


@app.get("/api/me")
def me(current_user=Depends(get_current_user)):
    return {
        "username": current_user["username"],
        "created_at": current_user["created_at"],
    }


@app.get("/api/search")
def search(
    q: str = Query(..., description="Search term"),
    field: str = Query("title", description="title|author|series|narrator"),
    current_user=Depends(get_current_user),
):
    # validate field into list expected by MAM API
    if field not in {"title", "author", "series", "narrator"}:
        field = "title"

    payload = {
        "tor": {
            "text": q,
            "srchIn": [field],
            "searchType": "all",
            "searchIn": "torrents",
            "main_cat": ["13"],      # Audiobooks
            "cat": ["0"],
            "browse_lang": ["1"],    # English
            "browseFlagsHideVsShow": "0",
            "sortType": "seedersDesc",
            "startNumber": "0",
            "perpage": 25,
        },
        "thumbnail": "true",
    }

    r = requests.post(
        f"{MAM_BASE}/tor/js/loadSearchJSONbasic.php",
        json=payload,
        headers=mam_headers(),
        timeout=15,
    )

    try:
        raw = r.json()
        data = raw.get("data", [])
    except Exception:
        return {
            "error": "Failed to parse MAM response",
            "text": r.text[:500],
        }

    print(f"[SEARCH] {current_user['username']} searched '{q}' ({field}) → {len(data)} results")

    results = []
    for t in data[:50]:
        title = t.get("title") or t.get("name") or ""
        author = t.get("author") or ""
        series = t.get("series") or ""
        filetypes = t.get("filetype") or t.get("filetypes") or ""
        cover = find_cover(title, author)

        results.append(
            {
                "id": t.get("id"),
                "title": title,
                "author": author,
                "series": series,
                "category": t.get("catname"),
                "size": t.get("size"),
                "seeders": t.get("seeders"),
                "filetypes": filetypes,
                "cover": cover,
            }
        )

    return JSONResponse(results)


@app.post("/api/add")
def add_torrent(body: AddTorrentRequest, current_user=Depends(get_current_user)):
    tid = body.tid
    print(f"[ADD] {current_user['username']} → tid={tid}")

    # Download torrent from MAM
    tor_url = f"{MAM_BASE}/tor/download.php?tid={tid}"
    torrent_resp = requests.get(tor_url, headers=mam_headers(), timeout=30)
    if torrent_resp.status_code != 200 or not torrent_resp.content:
        detail = f"Failed to fetch torrent from MAM (status {torrent_resp.status_code})"
        print("[ADD][ERR]", detail)
        raise HTTPException(status_code=502, detail=detail)

    # Login to qBittorrent
    login_resp = requests.post(
        f"{QBITTORRENT_URL}/api/v2/auth/login",
        data={"username": QBITTORRENT_USER, "password": QBITTORRENT_PASS},
        timeout=10,
    )
    if login_resp.status_code != 200 or "Ok" not in login_resp.text:
        detail = f"qBittorrent login failed (status {login_resp.status_code})"
        print("[ADD][ERR]", detail, login_resp.text)
        raise HTTPException(status_code=502, detail=detail)

    cookies = login_resp.cookies

    # Upload torrent
    files = {"torrents": (f"{tid}.torrent", torrent_resp.content)}
    data = {"savepath": QBITTORRENT_SAVEPATH, "autoTMM": "false"}

    add_resp = requests.post(
        f"{QBITTORRENT_URL}/api/v2/torrents/add",
        files=files,
        data=data,
        cookies=cookies,
        timeout=20,
    )

    if add_resp.status_code == 200:
        print(f"[ADD] ✅ Torrent {tid} added successfully to qBittorrent")
        # Try to look up title for nicer Discord message
        title = None
        try:
            # very small lookup: not critical if it fails
            # we don't re-hit MAM; user UI already knows title
            title = str(tid)
        except Exception:
            pass
        send_discord_notification(current_user["username"], tid, title=title)
        return {"status": "ok", "detail": f"Torrent {tid} added successfully"}
    else:
        detail = f"Failed to add torrent: {add_resp.text}"
        print(f"[ADD] ❌ qBittorrent error {add_resp.status_code}: {add_resp.text}")
        raise HTTPException(status_code=502, detail=detail)