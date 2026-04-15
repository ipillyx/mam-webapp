from fastapi import (
    FastAPI,
    Depends,
    HTTPException,
    status,
    Query,
    Request,
)
from fastapi.responses import JSONResponse, Response
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
from typing import Optional, List
from contextlib import asynccontextmanager
import re

# ----------------- ENV & CONFIG -----------------

_here = os.path.dirname(os.path.abspath(__file__))
ENV_PATH = os.path.join(_here, ".env")
if not os.path.isfile(ENV_PATH):
    ENV_PATH = os.path.join(os.getcwd(), ".env")

load_dotenv(ENV_PATH, override=True)

DB_PATH = os.getenv("DB_PATH", "/data/app.db")
print(f"[INIT] Using database at {DB_PATH}")

def normalise_mam_cookie(raw: str) -> str:
    if not raw:
        return ""
    raw = raw.strip()
    for prefix in ("mam_id=", "mam_id =", "MAM_ID=", "MAM_ID ="):
        if raw.startswith(prefix):
            raw = raw[len(prefix):]
            break
    return raw


MAM_COOKIE = normalise_mam_cookie(os.getenv("MAM_COOKIE", "") or "")
MAM_BASE = os.getenv("MAM_BASE", "https://www.myanonamouse.net")

QBITTORRENT_URL = os.getenv("QBITTORRENT_URL")
QBITTORRENT_USER = os.getenv("QBITTORRENT_USER")
QBITTORRENT_PASS = os.getenv("QBITTORRENT_PASS")
QBITTORRENT_SAVEPATH = os.getenv("QBITTORRENT_SAVEPATH", "/media/audiobooks")

JWT_SECRET = os.getenv("JWT_SECRET", "change_this_secret_key")
JWT_ALGO = os.getenv("JWT_ALGO", "HS256")
INVITE_CODE = os.getenv("INVITE_CODE", "invite-only-secret")

DISCORD_WEBHOOK = os.getenv("DISCORD_WEBHOOK", "").strip()

# How often (hours) the background job polls MAM for watchlist matches
WATCHLIST_POLL_HOURS = int(os.getenv("WATCHLIST_POLL_HOURS", "6"))

_stats_cache = None
_stats_cache_time = None
_STATS_CACHE_TTL_SECONDS = 300

BP_THRESHOLD = int(os.getenv("BP_THRESHOLD", "1000"))
BP_PRODUCT_ID = os.getenv("BP_PRODUCT_ID", "2")

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

    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS downloads (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            torrent_id TEXT NOT NULL,
            title TEXT,
            author TEXT,
            narrator TEXT,
            size TEXT,
            cover_url TEXT,
            added_at TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
        """
    )

    # Legacy wishlist table (MAM torrent-ID based) — kept for compatibility
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS wishlist (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            torrent_id TEXT NOT NULL,
            title TEXT,
            author TEXT,
            narrator TEXT,
            cover_url TEXT,
            notes TEXT,
            added_at TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id),
            UNIQUE(user_id, torrent_id)
        )
        """
    )

    # New watchlist table — OpenLibrary-based, polled against MAM
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS watchlist (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            ol_key TEXT NOT NULL,
            title TEXT NOT NULL,
            author TEXT,
            ol_cover_url TEXT,
            first_publish_year TEXT,
            series TEXT,
            mam_found INTEGER NOT NULL DEFAULT 0,
            mam_torrent_id TEXT,
            mam_title TEXT,
            last_checked TEXT,
            added_at TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id),
            UNIQUE(user_id, ol_key)
        )
        """
    )

    conn.commit()
    conn.close()
    print("[INIT] Database ready at", DB_PATH)


# ----------------- SCHEDULER -----------------

def _auto_download_to_qbit(tid: int, title: str, author: str, narrator: str,
                            size: str, cover_url: Optional[str], user_id: int) -> bool:
    """
    Send a torrent to qBittorrent and record it in download history.
    Returns True on success, False on any failure.
    Called from the background scheduler — must not raise.
    """
    try:
        tor_url = f"{MAM_BASE}/tor/download.php?tid={tid}"
        torrent_resp = requests.get(tor_url, headers=mam_headers(), timeout=30)
        if not torrent_resp.ok:
            print(f"[WATCHLIST AUTO-DL] Failed to fetch torrent file for tid={tid}: {torrent_resp.status_code}")
            return False

        login_resp = requests.post(
            f"{QBITTORRENT_URL}/api/v2/auth/login",
            data={"username": QBITTORRENT_USER, "password": QBITTORRENT_PASS},
            timeout=10,
        )
        if not login_resp.ok:
            print(f"[WATCHLIST AUTO-DL] qBit login failed: {login_resp.status_code}")
            return False

        add_resp = requests.post(
            f"{QBITTORRENT_URL}/api/v2/torrents/add",
            files={"torrents": (f"{tid}.torrent", torrent_resp.content)},
            data={
                "savepath": QBITTORRENT_SAVEPATH,
                "autoTMM": "false",
                "category": "mamarr",
                "tags": "audiobooks,MaM Do Not Delete",
            },
            cookies=login_resp.cookies,
            timeout=15,
        )
        if not add_resp.ok:
            print(f"[WATCHLIST AUTO-DL] qBit add failed: {add_resp.status_code}")
            return False

        record_download(user_id, str(tid), title, author, narrator, size, cover_url)
        print(f"[WATCHLIST AUTO-DL] ✓ '{title}' sent to qBittorrent (tid={tid})")
        return True

    except Exception as e:
        print(f"[WATCHLIST AUTO-DL] Exception for tid={tid}: {e}")
        return False


def poll_watchlist_against_mam():
    """
    Background job: for every unwatched entry, search MAM for the title.
    If a match is found, automatically download it to qBittorrent,
    record it in history, remove it from the watchlist, and notify via Discord.
    """
    import gzip as _gzip, json as _json

    print("[WATCHLIST POLL] Starting MAM poll for watchlist entries")

    if not QBITTORRENT_URL:
        print("[WATCHLIST POLL] Skipping — QBITTORRENT_URL not set")
        return

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    cur.execute("SELECT * FROM watchlist WHERE mam_found = 0")
    entries = cur.fetchall()

    # We need a user_id to record downloads — use the first registered user
    # (the app is single-household so this is fine)
    cur.execute("SELECT id FROM users ORDER BY id ASC LIMIT 1")
    user_row = cur.fetchone()
    conn.close()

    if not entries:
        print("[WATCHLIST POLL] No unwatched entries to check")
        return

    default_user_id = user_row["id"] if user_row else 1

    search_headers = {
        "Cookie": f"mam_id={normalise_mam_cookie(MAM_COOKIE)}" if MAM_COOKIE else "",
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/124.0.0.0 Safari/537.36"
        ),
        "Content-Type": "application/json",
        "Accept": "application/json, */*",
    }

    now = datetime.datetime.utcnow().isoformat()
    downloaded_count = 0

    for entry in entries:
        entry_id = entry["id"]
        title    = entry["title"]
        author   = entry["author"] or ""
        cover_url = entry["ol_cover_url"]
        user_id  = entry["user_id"] or default_user_id

        payload = {
            "tor": {
                "text": title,
                "srchIn": ["title"],
                "searchType": "all",
                "searchIn": "torrents",
                "main_cat": ["13"],
                "browse_lang": ["1"],
                "perpage": 5,
            },
            "thumbnail": "false",
            "description": "false",
        }

        try:
            r = requests.post(
                f"{MAM_BASE}/tor/js/loadSearchJSONbasic.php",
                json=payload,
                headers=search_headers,
                timeout=15,
            )
            raw = r.content
            try:
                parsed = _json.loads(raw)
            except Exception:
                parsed = _json.loads(_gzip.decompress(raw))

            data = []
            if isinstance(parsed, list):
                data = parsed
            elif isinstance(parsed, dict):
                data = parsed.get("data") or parsed.get("torrents") or parsed.get("results") or []

            # Case-insensitive title match
            match = None
            title_lower = title.lower()
            for item in data:
                mam_title = (item.get("title") or item.get("name") or "").lower()
                if title_lower in mam_title or mam_title in title_lower:
                    match = item
                    break

            if match:
                mam_tid   = int(match.get("id", 0))
                mam_title = match.get("title") or match.get("name") or title
                narrator  = match.get("narrator") or ""
                size      = str(match.get("size") or "")
                print(f"[WATCHLIST POLL] FOUND '{title}' → MAM tid={mam_tid} — auto-downloading")

                success = _auto_download_to_qbit(
                    tid=mam_tid, title=mam_title, author=author,
                    narrator=narrator, size=size,
                    cover_url=cover_url, user_id=user_id,
                )

                conn2 = sqlite3.connect(DB_PATH)
                if success:
                    # Remove from watchlist — it's been downloaded
                    conn2.execute("DELETE FROM watchlist WHERE id = ?", (entry_id,))
                    conn2.commit()
                    conn2.close()
                    downloaded_count += 1
                    _send_watchlist_discord(title, author, str(mam_tid), mam_title, auto_downloaded=True)
                else:
                    # Mark as found but leave in watchlist so it can be retried
                    # or manually downloaded
                    conn2.execute(
                        "UPDATE watchlist SET mam_found = 1, mam_torrent_id = ?, mam_title = ?, last_checked = ? WHERE id = ?",
                        (str(mam_tid), mam_title, now, entry_id),
                    )
                    conn2.commit()
                    conn2.close()
                    print(f"[WATCHLIST POLL] Auto-download failed for '{title}' — marked as found for manual download")
                    _send_watchlist_discord(title, author, str(mam_tid), mam_title, auto_downloaded=False)
            else:
                conn2 = sqlite3.connect(DB_PATH)
                conn2.execute("UPDATE watchlist SET last_checked = ? WHERE id = ?", (now, entry_id))
                conn2.commit()
                conn2.close()
                print(f"[WATCHLIST POLL] Not found yet: '{title}'")

        except Exception as e:
            print(f"[WATCHLIST POLL] Error checking '{title}': {e}")

    print(f"[WATCHLIST POLL] Done — {downloaded_count} auto-downloaded from {len(entries)} entries")


def _send_watchlist_discord(title: str, author: str, mam_tid: str, mam_title: str, auto_downloaded: bool = True):
    if not DISCORD_WEBHOOK:
        return
    try:
        if auto_downloaded:
            embed_title = "📚 Watchlist book auto-downloaded!"
            description = (
                f"**{title}**"
                + (f" by {author}" if author else "")
                + f"\n\nAutomatically sent to qBittorrent."
                + (f"\n_{mam_title}_" if mam_title != title else "")
            )
            color = 0x10B981  # emerald — success
        else:
            embed_title = "📖 Watchlist match found — download failed"
            description = (
                f"**{title}**"
                + (f" by {author}" if author else "")
                + f"\n\nFound on MAM but auto-download failed. Open the app to download manually."
            )
            color = 0xF59E0B  # amber — warning

        content = {
            "username": "MAM Library",
            "embeds": [{
                "title": embed_title,
                "description": description,
                "color": color,
                "footer": {"text": f"MAM torrent ID: {mam_tid}"},
            }],
        }
        requests.post(DISCORD_WEBHOOK, json=content, timeout=5)
    except Exception as e:
        print(f"[WEBHOOK] Watchlist Discord notification failed: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()

    # Start APScheduler for watchlist polling
    try:
        from apscheduler.schedulers.background import BackgroundScheduler
        scheduler = BackgroundScheduler()
        scheduler.add_job(
            poll_watchlist_against_mam,
            "interval",
            hours=WATCHLIST_POLL_HOURS,
            next_run_time=datetime.datetime.now() + datetime.timedelta(minutes=2),
            id="watchlist_poll",
        )
        scheduler.start()
        print(f"[SCHEDULER] Watchlist poll scheduled every {WATCHLIST_POLL_HOURS}h (first run in 2 min)")
        app.state.scheduler = scheduler
    except ImportError:
        print("[SCHEDULER] apscheduler not installed — watchlist auto-polling disabled. Run: pip install apscheduler")
        app.state.scheduler = None

    yield

    if getattr(app.state, "scheduler", None):
        app.state.scheduler.shutdown(wait=False)
        print("[SCHEDULER] Scheduler stopped")


# ----------------- APP -----------------

app = FastAPI(title="MAM WebApp API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
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


def mam_headers(referer: str = None):
    base = MAM_BASE or "https://www.myanonamouse.net"
    return {
        "Cookie": f"mam_id={normalise_mam_cookie(MAM_COOKIE)}" if MAM_COOKIE else "",
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/124.0.0.0 Safari/537.36"
        ),
        "Accept": "application/json, text/html, */*;q=0.9",
        "Accept-Language": "en-GB,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        "Referer": referer or f"{base}/",
        "Origin": base,
        "Connection": "keep-alive",
        "Sec-Fetch-Dest": "empty",
        "Sec-Fetch-Mode": "cors",
        "Sec-Fetch-Site": "same-origin",
    }


def cache_get_cover(title: str, author: str) -> Optional[str]:
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
    cover_url = row["cover_url"]
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


def find_cover(title: str, author: str, tid: Optional[str] = None) -> Optional[str]:
    title = (title or "").strip()
    author = (author or "").strip()
    if not title:
        return None
    cached = cache_get_cover(title, author)
    if cached:
        if cached.startswith("http://"):
            cached = cached.replace("http://", "https://")
        return cached
    query = f"{title} {author} audiobook".strip()
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
                    cover_url = art.replace("100x100", "600x600").replace("60x60", "600x600")
                    if cover_url.startswith("http://"):
                        cover_url = "https://" + cover_url[len("http://"):]
                    cache_set_cover(title, author, cover_url)
                    return cover_url
    except Exception:
        pass
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
                    if cover_url.startswith("http://"):
                        cover_url = "https://" + cover_url[len("http://"):]
                    cache_set_cover(title, author, cover_url)
                    return cover_url
    except Exception:
        pass
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
                    return cover_url
    except Exception:
        pass
    cache_set_cover(title, author, None)
    return None


def get_torrent_details_from_mam(tid: int) -> Optional[dict]:
    import gzip as _gzip, json as _json
    payload = {
        "tor": {
            "searchType": "all",
            "searchIn": "torrents",
            "tid": str(tid),
            "main_cat": ["13"],
            "startNumber": "0",
            "perpage": 1,
        },
        "thumbnail": "true",
        "description": "true",
    }
    try:
        search_headers = {
            "Cookie": f"mam_id={normalise_mam_cookie(MAM_COOKIE)}" if MAM_COOKIE else "",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            "Content-Type": "application/json",
            "Accept": "application/json, */*",
        }
        r = requests.post(
            f"{MAM_BASE}/tor/js/loadSearchJSONbasic.php",
            json=payload,
            headers=search_headers,
            timeout=10,
        )
        raw_bytes = r.content
        try:
            parsed = _json.loads(raw_bytes)
        except Exception:
            parsed = _json.loads(_gzip.decompress(raw_bytes))
        data = parsed.get("data", []) if isinstance(parsed, dict) else []
        if data:
            return data[0]
    except Exception as e:
        print(f"[MAM] Failed to get details for tid {tid}: {e}")
        return None
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


def get_mam_profile_data() -> Optional[dict]:
    try:
        r = requests.get(
            f"{MAM_BASE}/usercp.php",
            headers=mam_headers(),
            timeout=10,
        )
        r.raise_for_status()
        bp_match = re.search(r'Bonus Points:.*?<span[^>]*>([\d,]+)</span>', r.text)
        if bp_match:
            bp_value = int(bp_match.group(1).replace(',', ''))
            return {"bonus_points": bp_value}
        return None
    except Exception as e:
        print(f"[BP CHECK] Failed to fetch profile data: {e}")
        return None


def get_mam_stats() -> Optional[dict]:
    import gzip, json as _json

    base = MAM_BASE or "https://www.myanonamouse.net"
    headers = {
        "Cookie": f"mam_id={normalise_mam_cookie(MAM_COOKIE)}" if MAM_COOKIE else "",
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/124.0.0.0 Safari/537.36"
        ),
        "Accept": "application/json, */*",
        "Referer": f"{base}/",
    }
    try:
        r = requests.get(
            f"{base}/jsonLoad.php",
            headers=headers,
            timeout=15,
            allow_redirects=True,
            stream=False,
        )
        if "login.php" in r.url:
            print("[STATS] Redirected to login — cookie expired.")
            return None
        if r.status_code != 200:
            print(f"[STATS] jsonLoad.php returned {r.status_code}")
            return None
        raw = r.content
        try:
            data = _json.loads(raw)
            print(f"[STATS] Direct JSON OK — user: {data.get('username')}")
        except Exception:
            try:
                data = _json.loads(gzip.decompress(raw))
                print(f"[STATS] Gzip JSON OK — user: {data.get('username')}")
            except Exception as e2:
                print(f"[STATS] Both parse attempts failed: {e2} | raw[:40]={raw[:40]}")
                return None
        username = data.get("username")
        if not username:
            print(f"[STATS] No username in response. Keys: {list(data.keys())[:10]}")
            return None
        return {
            "upload":   str(data.get("uploaded",  "N/A")),
            "download": str(data.get("downloaded","N/A")),
            "ratio":    str(data.get("ratio",     "N/A")),
            "username": username,
        }
    except Exception as e:
        print(f"[STATS] Request failed: {e}")
        return None


def get_mam_stats_cached() -> Optional[dict]:
    global _stats_cache, _stats_cache_time
    import time
    now = time.time()
    if _stats_cache and _stats_cache_time and (now - _stats_cache_time) < _STATS_CACHE_TTL_SECONDS:
        return _stats_cache
    fresh = get_mam_stats()
    if fresh:
        _stats_cache = fresh
        _stats_cache_time = now
        return fresh
    if _stats_cache:
        return _stats_cache
    return None


def execute_bp_purchase(product_id: str) -> bool:
    try:
        r = requests.post(
            f"{MAM_BASE}/usercp.php?action=store",
            headers=mam_headers(),
            data={"id": product_id, "confirm": "yes"},
            timeout=10,
        )
        r.raise_for_status()
        if "item has been purchased" in r.text or r.status_code == 302:
            return True
        return False
    except Exception as e:
        print(f"[BP PURCHASE] Exception during purchase: {e}")
        return False


# ----------------- HISTORY HELPERS -----------------

def record_download(user_id: int, torrent_id: str, title: str, author: str,
                    narrator: str, size: str, cover_url: Optional[str]):
    conn = get_db()
    cur = conn.cursor()
    cur.execute(
        """
        INSERT INTO downloads (user_id, torrent_id, title, author, narrator, size, cover_url, added_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (user_id, str(torrent_id), title, author, narrator, size, cover_url,
         datetime.datetime.utcnow().isoformat()),
    )
    conn.commit()
    conn.close()


def check_already_downloaded(user_id: int, torrent_id: str) -> bool:
    conn = get_db()
    cur = conn.cursor()
    cur.execute(
        "SELECT id FROM downloads WHERE user_id = ? AND torrent_id = ?",
        (user_id, str(torrent_id)),
    )
    row = cur.fetchone()
    conn.close()
    return row is not None


def get_user_downloaded_ids(user_id: int) -> set:
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT torrent_id FROM downloads WHERE user_id = ?", (user_id,))
    rows = cur.fetchall()
    conn.close()
    return {r["torrent_id"] for r in rows}


def get_user_wishlist_ids(user_id: int) -> set:
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT torrent_id FROM wishlist WHERE user_id = ?", (user_id,))
    rows = cur.fetchall()
    conn.close()
    return {r["torrent_id"] for r in rows}


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
    title: Optional[str] = None


class WishlistAddRequest(BaseModel):
    torrent_id: str
    title: Optional[str] = None
    author: Optional[str] = None
    narrator: Optional[str] = None
    cover_url: Optional[str] = None
    notes: Optional[str] = None


class WatchlistAddRequest(BaseModel):
    ol_key: str
    title: str
    author: Optional[str] = None
    ol_cover_url: Optional[str] = None
    first_publish_year: Optional[str] = None
    series: Optional[str] = None


# ----------------- AUTH -----------------

def get_current_user(token: str = Depends(oauth2_scheme)):
    username = decode_token(token)
    if not username:
        raise HTTPException(status_code=401, detail="Invalid authentication")
    user = get_user_by_username(username)
    if not user:
        raise HTTPException(status_code=401, detail="User no longer exists")
    return user


def get_user_from_url_token(token: str = Query(..., alias="token")):
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


@app.get("/api/public/stats")
def get_public_stats():
    # Get watchlist count from SQLite (always available, no MAM cookie needed)
    try:
        conn = get_db()
        wishlist_count = conn.execute("SELECT COUNT(*) FROM watchlist").fetchone()[0]
        conn.close()
    except Exception:
        wishlist_count = 0

    if not MAM_COOKIE:
        return JSONResponse({
            "upload": "N/A", "download": "N/A", "ratio": "N/A",
            "username": "N/A", "wishlist_count": wishlist_count,
        })
    stats = get_mam_stats_cached()
    if not stats:
        return JSONResponse({
            "upload": "N/A", "download": "N/A", "ratio": "N/A",
            "username": "N/A", "wishlist_count": wishlist_count,
        })
    return JSONResponse({**stats, "wishlist_count": wishlist_count})


@app.get("/api/user/stats")
def get_user_stats(current_user=Depends(get_current_user)):
    if not MAM_COOKIE:
        return JSONResponse({
            "upload": "N/A", "download": "N/A", "ratio": "N/A",
            "username": current_user["username"],
            "warning": "MAM_COOKIE not set",
        })
    stats = get_mam_stats()
    if not stats:
        return JSONResponse({
            "upload": "N/A", "download": "N/A", "ratio": "N/A",
            "username": current_user["username"],
            "warning": "Could not fetch stats from MAM",
        })
    return JSONResponse(stats)


@app.get("/api/proxy/cover")
def proxy_cover(
    url: str = Query(..., description="External cover URL to proxy"),
    current_user=Depends(get_user_from_url_token),
):
    try:
        img_resp = requests.get(url, timeout=10)
        img_resp.raise_for_status()
        content_type = img_resp.headers.get("Content-Type", "").lower()
        if not content_type.startswith("image/"):
            raise HTTPException(status_code=404, detail="Invalid content type")
        return Response(
            content=img_resp.content,
            media_type=content_type,
            headers={"Cache-Control": "public, max-age=86400"},
        )
    except Exception:
        raise HTTPException(status_code=502, detail="Failed to proxy cover")


@app.post("/api/automation/run_bp_check")
def run_bonus_point_automation():
    if not MAM_COOKIE:
        return {"status": "skipped", "reason": "MAM_COOKIE not set"}
    profile_data = get_mam_profile_data()
    if not profile_data:
        return {"status": "failed", "reason": "No BP data"}
    current_bp = profile_data["bonus_points"]
    if current_bp > BP_THRESHOLD:
        if execute_bp_purchase(BP_PRODUCT_ID):
            send_discord_notification(
                user="System Automator",
                tid=0,
                title=f"SUCCESS: Auto-purchased upload credit with {current_bp} BP.",
            )
            return {"status": "success"}
    return {"status": "success", "action": "none"}


@app.get("/api/search")
def search(
    q: str = Query(..., description="Search term"),
    field: str = Query("title", description="title|author|series|narrator"),
    current_user=Depends(get_current_user),
):
    print(f"[SEARCH] Starting search: q={repr(q)} field={field}")
    if field not in {"title", "author", "series", "narrator"}:
        field = "title"

    user_id = current_user["id"]
    try:
        downloaded_ids = get_user_downloaded_ids(user_id)
    except Exception as e:
        print(f"[SEARCH] downloaded_ids error: {e}")
        downloaded_ids = set()
    try:
        wishlist_ids = get_user_wishlist_ids(user_id)
    except Exception as e:
        print(f"[SEARCH] wishlist_ids error: {e}")
        wishlist_ids = set()

    payload = {
        "tor": {
            "text": q,
            "srchIn": [field],
            "searchType": "all",
            "searchIn": "torrents",
            "main_cat": ["13"],
            "browse_lang": ["1"],
            "perpage": 25,
        },
        "thumbnail": "true",
        "description": "true",
    }
    search_headers = {
        "Cookie": f"mam_id={normalise_mam_cookie(MAM_COOKIE)}" if MAM_COOKIE else "",
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/124.0.0.0 Safari/537.36"
        ),
        "Content-Type": "application/json",
        "Accept": "application/json, */*",
    }
    r = requests.post(
        f"{MAM_BASE}/tor/js/loadSearchJSONbasic.php",
        json=payload,
        headers=search_headers,
        timeout=15,
    )

    import gzip as _gzip, json as _json
    data = []
    print(f"[SEARCH] MAM responded: status={r.status_code} bytes={len(r.content)}")
    try:
        raw_bytes = r.content
        try:
            parsed = _json.loads(raw_bytes)
        except Exception:
            try:
                parsed = _json.loads(_gzip.decompress(raw_bytes))
            except Exception as ge:
                print(f"[SEARCH] Cannot decode response: {ge} | hex={raw_bytes[:20].hex()}")
                return JSONResponse([])

        print(f"[SEARCH] Parsed type={type(parsed).__name__} keys={list(parsed.keys()) if isinstance(parsed,dict) else 'LIST'}")

        if isinstance(parsed, list):
            data = parsed
        elif isinstance(parsed, dict):
            data = parsed.get("data") or parsed.get("torrents") or parsed.get("results") or []
            if not data:
                print(f"[SEARCH] No data key found. All keys: {list(parsed.keys())}")
                if parsed.get("total") == 0 or parsed.get("found") == 0:
                    return JSONResponse([])
                return JSONResponse([])

        print(f"[SEARCH] q={repr(q)} → {len(data)} results")
    except Exception as e:
        print(f"[SEARCH] Unexpected error: {e}")
        return JSONResponse([])

    results = []
    for t in data[:50]:
        title = t.get("title") or t.get("name") or ""
        author = t.get("author") or ""
        tid_str = str(t.get("id", ""))
        try:
            cover = find_cover(title, author, tid=tid_str)
        except Exception:
            cover = None
        results.append({
            "id": t.get("id"),
            "title": title,
            "author": author,
            "series": t.get("series") or "",
            "narrator": t.get("narrator") or "",
            "size": t.get("size"),
            "seeders": t.get("seeders"),
            "filetypes": t.get("filetype") or "",
            "cover": cover,
            "free": t.get("free") == "1",
            "vip": t.get("vip") == "1",
            "description": t.get("description"),
            "already_downloaded": tid_str in downloaded_ids,
            "in_wishlist": tid_str in wishlist_ids,
        })
    return JSONResponse(results)


@app.post("/api/add")
def add_torrent(body: AddTorrentRequest, current_user=Depends(get_current_user)):
    tid = body.tid
    user_id = current_user["id"]

    torrent_data = get_torrent_details_from_mam(tid)
    if not torrent_data:
        raise HTTPException(status_code=502, detail="MAM lookup failed")

    title = body.title or torrent_data.get("title") or ""
    author = torrent_data.get("author") or ""
    narrator = torrent_data.get("narrator") or ""
    size = str(torrent_data.get("size") or "")
    cover = find_cover(title, author, tid=str(tid))

    qbit_category = "mamarr"
    filetypes = torrent_data.get("filetypes") or torrent_data.get("filetype") or ""
    tags = ["audiobooks", "MaM Do Not Delete"]
    if filetypes:
        raw_file_tags = [t.strip().lower() for t in filetypes.split(",")]
        filtered_file_tags = [t for t in raw_file_tags if t != "m4b"]
        tags.extend(filtered_file_tags)
    qbit_tags = ",".join(tags)

    tor_url = f"{MAM_BASE}/tor/download.php?tid={tid}"
    torrent_resp = requests.get(tor_url, headers=mam_headers(), timeout=30)
    if not torrent_resp.ok:
        raise HTTPException(status_code=502, detail="Download failed")

    login_resp = requests.post(
        f"{QBITTORRENT_URL}/api/v2/auth/login",
        data={"username": QBITTORRENT_USER, "password": QBITTORRENT_PASS},
    )
    if not login_resp.ok:
        raise HTTPException(status_code=502, detail="qBit login failed")

    files = {"torrents": (f"{tid}.torrent", torrent_resp.content)}
    data = {
        "savepath": QBITTORRENT_SAVEPATH,
        "autoTMM": "false",
        "category": qbit_category,
        "tags": qbit_tags,
    }
    add_resp = requests.post(
        f"{QBITTORRENT_URL}/api/v2/torrents/add",
        files=files,
        data=data,
        cookies=login_resp.cookies,
    )
    if add_resp.ok:
        record_download(user_id, str(tid), title, author, narrator, size, cover)

        conn = get_db()
        conn.execute(
            "DELETE FROM wishlist WHERE user_id = ? AND torrent_id = ?",
            (user_id, str(tid)),
        )
        conn.commit()
        conn.close()

        send_discord_notification(current_user["username"], tid, title=title)
        return {"status": "ok"}

    raise HTTPException(status_code=502, detail="Add failed")


# ----------------- HISTORY ROUTES -----------------

@app.get("/api/history")
def get_history(
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    current_user=Depends(get_current_user),
):
    user_id = current_user["id"]
    offset = (page - 1) * limit
    conn = get_db()
    cur = conn.cursor()

    cur.execute("SELECT COUNT(*) FROM downloads WHERE user_id = ?", (user_id,))
    total = cur.fetchone()[0]

    cur.execute(
        """
        SELECT id, torrent_id, title, author, narrator, size, cover_url, added_at
        FROM downloads
        WHERE user_id = ?
        ORDER BY added_at DESC
        LIMIT ? OFFSET ?
        """,
        (user_id, limit, offset),
    )
    rows = cur.fetchall()
    conn.close()

    items = [dict(r) for r in rows]
    return JSONResponse({"total": total, "page": page, "items": items})


@app.delete("/api/history/{entry_id}")
def delete_history_entry(entry_id: int, current_user=Depends(get_current_user)):
    user_id = current_user["id"]
    conn = get_db()
    cur = conn.cursor()
    cur.execute(
        "DELETE FROM downloads WHERE id = ? AND user_id = ?", (entry_id, user_id)
    )
    conn.commit()
    deleted = cur.rowcount
    conn.close()
    if deleted == 0:
        raise HTTPException(status_code=404, detail="Entry not found")
    return {"status": "deleted"}


# ----------------- LEGACY WISHLIST ROUTES -----------------

@app.get("/api/wishlist")
def get_wishlist(current_user=Depends(get_current_user)):
    user_id = current_user["id"]
    conn = get_db()
    cur = conn.cursor()
    cur.execute(
        """
        SELECT id, torrent_id, title, author, narrator, cover_url, notes, added_at
        FROM wishlist
        WHERE user_id = ?
        ORDER BY added_at DESC
        """,
        (user_id,),
    )
    rows = cur.fetchall()
    conn.close()
    return JSONResponse([dict(r) for r in rows])


@app.post("/api/wishlist")
def add_to_wishlist(body: WishlistAddRequest, current_user=Depends(get_current_user)):
    user_id = current_user["id"]
    conn = get_db()
    cur = conn.cursor()
    try:
        cur.execute(
            """
            INSERT INTO wishlist (user_id, torrent_id, title, author, narrator, cover_url, notes, added_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                user_id,
                body.torrent_id,
                body.title,
                body.author,
                body.narrator,
                body.cover_url,
                body.notes,
                datetime.datetime.utcnow().isoformat(),
            ),
        )
        conn.commit()
    except sqlite3.IntegrityError:
        conn.close()
        raise HTTPException(status_code=409, detail="Already in wishlist")
    finally:
        conn.close()
    return {"status": "added"}


@app.delete("/api/wishlist/{torrent_id}")
def remove_from_wishlist(torrent_id: str, current_user=Depends(get_current_user)):
    user_id = current_user["id"]
    conn = get_db()
    cur = conn.cursor()
    cur.execute(
        "DELETE FROM wishlist WHERE user_id = ? AND torrent_id = ?",
        (user_id, torrent_id),
    )
    conn.commit()
    deleted = cur.rowcount
    conn.close()
    if deleted == 0:
        raise HTTPException(status_code=404, detail="Not in wishlist")
    return {"status": "removed"}


# ----------------- WATCHLIST ROUTES (OpenLibrary-based) -----------------

@app.get("/api/openlibrary/search")
def openlibrary_search(
    q: str = Query(..., description="Book title or author to search"),
    current_user=Depends(get_current_user),
):
    """
    Proxy OpenLibrary search and return clean, app-ready book data.
    Used by the Watchlist Browse tab.
    """
    if not q or len(q.strip()) < 2:
        raise HTTPException(status_code=400, detail="Query too short")

    try:
        resp = requests.get(
            "https://openlibrary.org/search.json",
            params={
                "q": q.strip(),
                "fields": "key,title,author_name,cover_i,first_publish_year,series,subject",
                "limit": 20,
            },
            timeout=10,
            headers={"User-Agent": "MAMWebApp/1.0 (audiobook manager)"},
        )
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        print(f"[OL SEARCH] Failed: {e}")
        raise HTTPException(status_code=502, detail="OpenLibrary unavailable")

    docs = data.get("docs", [])
    results = []
    for doc in docs[:20]:
        cover_i = doc.get("cover_i")
        cover_url = (
            f"https://covers.openlibrary.org/b/id/{cover_i}-M.jpg"
            if cover_i else None
        )
        authors = doc.get("author_name") or []
        series_list = doc.get("series") or []
        results.append({
            "ol_key": doc.get("key", ""),
            "title": doc.get("title", ""),
            "author": authors[0] if authors else None,
            "ol_cover_url": cover_url,
            "first_publish_year": str(doc.get("first_publish_year", "")) or None,
            "series": series_list[0] if series_list else None,
        })

    return JSONResponse(results)


@app.get("/api/watchlist")
def get_watchlist(current_user=Depends(get_current_user)):
    """
    Return the user's watchlist, split into found and watching.
    Also returns poll metadata (last checked, next poll estimate).
    """
    user_id = current_user["id"]
    conn = get_db()
    cur = conn.cursor()
    cur.execute(
        """
        SELECT id, ol_key, title, author, ol_cover_url, first_publish_year, series,
               mam_found, mam_torrent_id, mam_title, last_checked, added_at
        FROM watchlist
        WHERE user_id = ?
        ORDER BY mam_found DESC, added_at DESC
        """,
        (user_id,),
    )
    rows = cur.fetchall()
    conn.close()

    items = [dict(r) for r in rows]

    # Work out when we last polled anything and estimate next run
    checked_times = [r["last_checked"] for r in items if r["last_checked"]]
    last_checked = max(checked_times) if checked_times else None
    next_poll_hours = WATCHLIST_POLL_HOURS

    return JSONResponse({
        "items": items,
        "total": len(items),
        "found_count": sum(1 for r in items if r["mam_found"]),
        "watching_count": sum(1 for r in items if not r["mam_found"]),
        "last_checked": last_checked,
        "poll_interval_hours": next_poll_hours,
    })


@app.post("/api/watchlist")
def add_to_watchlist(body: WatchlistAddRequest, current_user=Depends(get_current_user)):
    """Add a book from OpenLibrary to the watchlist."""
    user_id = current_user["id"]
    if not body.ol_key or not body.title:
        raise HTTPException(status_code=400, detail="ol_key and title are required")

    conn = get_db()
    cur = conn.cursor()
    try:
        cur.execute(
            """
            INSERT INTO watchlist
                (user_id, ol_key, title, author, ol_cover_url, first_publish_year, series, added_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                user_id,
                body.ol_key,
                body.title,
                body.author,
                body.ol_cover_url,
                body.first_publish_year,
                body.series,
                datetime.datetime.utcnow().isoformat(),
            ),
        )
        conn.commit()
        new_id = cur.lastrowid
    except sqlite3.IntegrityError:
        conn.close()
        raise HTTPException(status_code=409, detail="Already in watchlist")
    finally:
        conn.close()

    return {"status": "added", "id": new_id}


@app.delete("/api/watchlist/{entry_id}")
def remove_from_watchlist(entry_id: int, current_user=Depends(get_current_user)):
    """Remove a watchlist entry by its DB id."""
    user_id = current_user["id"]
    conn = get_db()
    cur = conn.cursor()
    cur.execute(
        "DELETE FROM watchlist WHERE id = ? AND user_id = ?",
        (entry_id, user_id),
    )
    conn.commit()
    deleted = cur.rowcount
    conn.close()
    if deleted == 0:
        raise HTTPException(status_code=404, detail="Entry not found")
    return {"status": "removed"}


@app.post("/api/watchlist/poll")
def manual_watchlist_poll(current_user=Depends(get_current_user)):
    """
    Manually trigger a MAM poll for all unwatched watchlist entries.
    Useful after adding new books or if Catherine wants an immediate check.
    """
    if not MAM_COOKIE:
        raise HTTPException(status_code=503, detail="MAM_COOKIE not set — cannot poll MAM")
    try:
        poll_watchlist_against_mam()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Poll failed: {e}")
    return {"status": "ok", "message": "Poll complete — check watchlist for updates"}


@app.post("/api/watchlist/{entry_id}/download")
def download_watchlist_entry(entry_id: int, current_user=Depends(get_current_user)):
    """
    Convenience endpoint: download a found watchlist entry directly by its DB id.
    Delegates to the existing /api/add logic, then removes from watchlist.
    """
    user_id = current_user["id"]
    conn = get_db()
    cur = conn.cursor()
    cur.execute(
        "SELECT * FROM watchlist WHERE id = ? AND user_id = ?",
        (entry_id, user_id),
    )
    entry = cur.fetchone()
    conn.close()

    if not entry:
        raise HTTPException(status_code=404, detail="Watchlist entry not found")
    if not entry["mam_found"] or not entry["mam_torrent_id"]:
        raise HTTPException(status_code=400, detail="Book not yet found on MAM")

    tid = int(entry["mam_torrent_id"])
    title = entry["mam_title"] or entry["title"]

    # Reuse the existing add logic
    torrent_data = get_torrent_details_from_mam(tid)
    if not torrent_data:
        raise HTTPException(status_code=502, detail="MAM lookup failed")

    author = entry["author"] or torrent_data.get("author") or ""
    narrator = torrent_data.get("narrator") or ""
    size = str(torrent_data.get("size") or "")
    cover = entry["ol_cover_url"] or find_cover(title, author, tid=str(tid))

    filetypes = torrent_data.get("filetypes") or torrent_data.get("filetype") or ""
    tags = ["audiobooks", "MaM Do Not Delete"]
    if filetypes:
        raw_file_tags = [t.strip().lower() for t in filetypes.split(",")]
        tags.extend([t for t in raw_file_tags if t != "m4b"])
    qbit_tags = ",".join(tags)

    tor_url = f"{MAM_BASE}/tor/download.php?tid={tid}"
    torrent_resp = requests.get(tor_url, headers=mam_headers(), timeout=30)
    if not torrent_resp.ok:
        raise HTTPException(status_code=502, detail="Torrent download from MAM failed")

    login_resp = requests.post(
        f"{QBITTORRENT_URL}/api/v2/auth/login",
        data={"username": QBITTORRENT_USER, "password": QBITTORRENT_PASS},
    )
    if not login_resp.ok:
        raise HTTPException(status_code=502, detail="qBit login failed")

    add_resp = requests.post(
        f"{QBITTORRENT_URL}/api/v2/torrents/add",
        files={"torrents": (f"{tid}.torrent", torrent_resp.content)},
        data={
            "savepath": QBITTORRENT_SAVEPATH,
            "autoTMM": "false",
            "category": "mamarr",
            "tags": qbit_tags,
        },
        cookies=login_resp.cookies,
    )
    if not add_resp.ok:
        raise HTTPException(status_code=502, detail="qBit add failed")

    record_download(user_id, str(tid), title, author, narrator, size, cover)

    # Remove from watchlist now it's downloaded
    conn2 = get_db()
    conn2.execute("DELETE FROM watchlist WHERE id = ? AND user_id = ?", (entry_id, user_id))
    conn2.commit()
    conn2.close()

    send_discord_notification(current_user["username"], tid, title=title)
    return {"status": "ok"}


# ----------------- SETTINGS (live .env editor) -----------------

EDITABLE_KEYS = [
    "MAM_COOKIE",
    "MAM_BASE",
    "QBITTORRENT_URL",
    "QBITTORRENT_USER",
    "QBITTORRENT_PASS",
    "QBITTORRENT_SAVEPATH",
    "INVITE_CODE",
    "DISCORD_WEBHOOK",
    "BP_THRESHOLD",
    "BP_PRODUCT_ID",
    "WATCHLIST_POLL_HOURS",
]

SENSITIVE_KEYS = {"MAM_COOKIE", "QBITTORRENT_PASS", "DISCORD_WEBHOOK"}


def _read_env_file() -> dict:
    result = {}
    if not os.path.isfile(ENV_PATH):
        return result
    with open(ENV_PATH, "r") as f:
        for line in f:
            stripped = line.strip()
            if not stripped or stripped.startswith("#"):
                continue
            if "=" in stripped:
                k, _, v = stripped.partition("=")
                result[k.strip()] = v.strip().strip('"').strip("'")
    return result


def _write_env_key(key: str, value: str):
    if not os.path.isfile(ENV_PATH):
        with open(ENV_PATH, "w") as f:
            f.write(f'{key}="{value}"\n')
        return
    with open(ENV_PATH, "r") as f:
        lines = f.readlines()
    found = False
    new_lines = []
    for line in lines:
        stripped = line.strip()
        if stripped.startswith(f"{key}=") or stripped.startswith(f"{key} ="):
            new_lines.append(f'{key}="{value}"\n')
            found = True
        else:
            new_lines.append(line)
    if not found:
        new_lines.append(f'{key}="{value}"\n')
    with open(ENV_PATH, "w") as f:
        f.writelines(new_lines)


def _apply_env_to_globals(key: str, value: str):
    global MAM_COOKIE, MAM_BASE, QBITTORRENT_URL, QBITTORRENT_USER
    global QBITTORRENT_PASS, QBITTORRENT_SAVEPATH, INVITE_CODE
    global DISCORD_WEBHOOK, BP_THRESHOLD, BP_PRODUCT_ID, WATCHLIST_POLL_HOURS

    os.environ[key] = value
    if key == "MAM_COOKIE":             MAM_COOKIE = normalise_mam_cookie(value)
    elif key == "MAM_BASE":             MAM_BASE = value
    elif key == "QBITTORRENT_URL":      QBITTORRENT_URL = value
    elif key == "QBITTORRENT_USER":     QBITTORRENT_USER = value
    elif key == "QBITTORRENT_PASS":     QBITTORRENT_PASS = value
    elif key == "QBITTORRENT_SAVEPATH": QBITTORRENT_SAVEPATH = value
    elif key == "INVITE_CODE":          INVITE_CODE = value
    elif key == "DISCORD_WEBHOOK":      DISCORD_WEBHOOK = value.strip()
    elif key == "BP_THRESHOLD":
        try: BP_THRESHOLD = int(value)
        except ValueError: pass
    elif key == "BP_PRODUCT_ID":        BP_PRODUCT_ID = value
    elif key == "WATCHLIST_POLL_HOURS":
        try: WATCHLIST_POLL_HOURS = int(value)
        except ValueError: pass


class SettingUpdate(BaseModel):
    key: str
    value: str


@app.get("/api/settings")
def get_settings(current_user=Depends(get_current_user)):
    env = _read_env_file()
    result = []
    for key in EDITABLE_KEYS:
        raw_val = env.get(key, os.getenv(key, ""))
        masked = key in SENSITIVE_KEYS and bool(raw_val)
        result.append({
            "key": key,
            "value": "••••••••" if masked else raw_val,
            "masked": masked,
        })
    return JSONResponse(result)


@app.post("/api/settings")
def update_setting(body: SettingUpdate, current_user=Depends(get_current_user)):
    if body.key not in EDITABLE_KEYS:
        raise HTTPException(status_code=400, detail=f"Key '{body.key}' is not editable")
    _write_env_key(body.key, body.value)
    _apply_env_to_globals(body.key, body.value)
    print(f"[SETTINGS] {current_user['username']} updated {body.key}")
    return {"status": "saved", "key": body.key}


# ----------------- DEBUG ENDPOINTS -----------------

@app.get("/api/debug/cookie")
def debug_cookie(current_user=Depends(get_current_user)):
    raw = MAM_COOKIE or ""
    if not raw:
        return {"status": "empty", "hint": "No MAM_COOKIE set. Go to Settings and paste your mam_id value."}
    masked = raw[:6] + "•••••" + raw[-6:] if len(raw) > 12 else "•••••"
    built  = f"mam_id={raw}"
    return {
        "status":         "set",
        "cookie_length":  len(raw),
        "cookie_preview": masked,
        "header_built":   f"mam_id={raw[:6]}•••{raw[-4:]}",
        "header_length":  len(built),
    }


@app.get("/api/debug/stats-test")
def debug_stats_test(current_user=Depends(get_current_user)):
    base    = MAM_BASE or "https://www.myanonamouse.net"
    results = {}

    import gzip, json as _json
    try:
        h1 = {
            "Cookie": f"mam_id={normalise_mam_cookie(MAM_COOKIE)}" if MAM_COOKIE else "",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36",
            "Accept": "application/json, */*",
            "Referer": f"{base}/",
        }
        r1 = requests.get(f"{base}/jsonLoad.php", headers=h1, timeout=12, allow_redirects=True)
        raw1 = r1.content
        parse_method = "none"
        data1 = None
        try:
            data1 = _json.loads(raw1)
            parse_method = "direct_json"
        except Exception:
            try:
                data1 = _json.loads(gzip.decompress(raw1))
                parse_method = "gzip_json"
            except Exception:
                pass
        results["jsonload"] = {
            "status_code":         r1.status_code,
            "final_url":           r1.url,
            "redirected_to_login": "login.php" in r1.url,
            "content_length":      len(raw1),
            "parse_method":        parse_method,
            "username":            data1.get("username") if data1 else None,
            "uploaded":            data1.get("uploaded") if data1 else None,
            "downloaded":          data1.get("downloaded") if data1 else None,
            "ratio":               data1.get("ratio") if data1 else None,
            "raw_preview":         raw1[:80].hex() if not data1 else None,
        }
    except Exception as ex:
        results["jsonload"] = {"error": str(ex)}

    try:
        r2 = requests.get(
            f"{base}/usercp.php",
            headers=mam_headers(referer=f"{base}/"),
            timeout=12, allow_redirects=True,
        )
        results["usercp"] = {
            "status_code":         r2.status_code,
            "final_url":           r2.url,
            "redirected_to_login": "login.php" in r2.url,
            "body_preview":        r2.text[:500],
        }
    except Exception as ex:
        results["usercp"] = {"error": str(ex)}

    return JSONResponse(results)


@app.get("/api/debug/watchlist-poll")
def debug_watchlist_poll(current_user=Depends(get_current_user)):
    """Trigger a poll and return a summary of what was checked."""
    if not MAM_COOKIE:
        return JSONResponse({"status": "skipped", "reason": "MAM_COOKIE not set"})
    poll_watchlist_against_mam()
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT title, mam_found, mam_torrent_id, last_checked FROM watchlist WHERE user_id = ?",
                (current_user["id"],))
    rows = cur.fetchall()
    conn.close()
    return JSONResponse({
        "status": "complete",
        "entries": [dict(r) for r in rows],
    })
