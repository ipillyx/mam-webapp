import React, { useState, useEffect } from "react";

/* ================================
   CONFIG
================================ */
const API_URL = import.meta.env.VITE_API_URL || "/api";

/* Decode JWT */
function parseJwt(token) {
  try {
    const base64Url = token.split(".")[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(
      decodeURIComponent(
        atob(base64)
          .split("")
          .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
          .join("")
      )
    );
  } catch {
    return null;
  }
}

/* Toast Component */
function ToastContainer({ toasts }) {
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 w-72">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`animate-toastSlideIn p-3 rounded-xl text-white shadow-lg ${
            t.type === "success"
              ? "bg-emerald-600"
              : t.type === "error"
              ? "bg-red-600"
              : "bg-emerald-500/90"
          }`}
        >
          {t.text}
        </div>
      ))}
    </div>
  );
}

export default function App() {
  /* =============================
          STATE
  ============================== */
  const [page, setPage] = useState("login");
  const [token, setToken] = useState(localStorage.getItem("mam_token") || "");
  const [username, setUsername] = useState("");

  const [loginForm, setLoginForm] = useState({ username: "", password: "" });

  // Signup form
  const [signupForm, setSignupForm] = useState({
    username: "",
    password: "",
    invite_code: "",
  });

  const [searchTerm, setSearchTerm] = useState("");
  const [searchField, setSearchField] = useState("title");
  const [results, setResults] = useState({});
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const [toasts, setToasts] = useState([]);

  /* Toast helper */
  const addToast = (text, type = "info", duration = 3500) => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, text, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, duration);
  };

  /* Load user from token automatically */
  useEffect(() => {
  if (!token) return;
  const payload = parseJwt(token);
  if (!payload || !payload.sub) return;
  setUsername(payload.sub);
  setPage("search");
}, [token]);


  /* Logout */
  const logout = () => {
    setToken("");
    setUsername("");
    localStorage.removeItem("mam_token");
    setResults({});
    setPage("login");
    addToast("Logged out", "info");
  };

  /* =============================
           LOGIN
  ============================== */
  async function handleLogin(e) {
    e.preventDefault();
    setMessage("");

    try {
      const formData = new URLSearchParams();
      formData.append("username", loginForm.username);
      formData.append("password", loginForm.password);

      const res = await fetch(`${API_URL}/api/login`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: formData,
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        addToast("❌ Invalid login", "error");
        setMessage("Invalid login");
        return;
      }

      localStorage.setItem("mam_token", data.access_token);
      setToken(data.access_token);

      const jwt = parseJwt(data.access_token);
      setUsername(jwt?.sub || loginForm.username);

      addToast(`✅ Welcome ${jwt?.sub}`, "success");
      setPage("search");
    } catch (err) {
      console.error("Login error:", err);
      addToast("⚠️ Login error", "error");
    }
  }

  /* =============================
           SIGNUP
  ============================== */
  async function handleSignup(e) {
    e.preventDefault();
    setMessage("");

    try {
      const res = await fetch(`${API_URL}/api/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(signupForm),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        addToast("❌ " + (data.detail || "Signup failed"), "error");
        setMessage(data.detail || "Signup failed");
        return;
      }

      localStorage.setItem("mam_token", data.access_token);
      setToken(data.access_token);

      const jwt = parseJwt(data.access_token);
      setUsername(jwt?.sub || signupForm.username);

      addToast("✅ Account created!", "success");
      setPage("search");
    } catch (err) {
      console.error("Signup error:", err);
      addToast("⚠️ Error signing up", "error");
    }
  }

  /* =============================
           SEARCH
  ============================== */
  async function handleSearch(e) {
    e.preventDefault();
    setMessage("");

    if (!token) {
      addToast("Login required", "error");
      return;
    }

    setLoading(true);
    addToast("🔍 Searching…", "info");

    try {
      const url = `${API_URL}/api/search?q=${encodeURIComponent(
        searchTerm
      )}&field=${encodeURIComponent(searchField)}`;

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await res.json().catch(() => null);

      if (!data || !res.ok) {
        setResults({});
        addToast("❌ Search failed", "error");
        setMessage("Search failed");
        return;
      }

      setResults(typeof data === "object" ? data : {});
    } catch (err) {
      console.error(err);
      setMessage("Error searching");
      addToast("⚠️ Error searching", "error");
    } finally {
      setLoading(false);
    }
  }

  /* =============================
           ADD TORRENT
  ============================== */
  async function addTorrent(id, title) {
    addToast(`📤 Sending ${title}...`, "info");

    try {
      const res = await fetch(`${API_URL}/api/add`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ tid: id }),
      });

      if (res.ok) {
        addToast(`✅ Added ${title}`, "success");
      } else {
        addToast("❌ Failed to add", "error");
      }
    } catch {
      addToast("⚠️ Error adding torrent", "error");
    }
  }

  /* =============================
     LOGIN / SIGNUP UI
  ============================== */
  if (page === "login" || page === "signup") {
    return (
      <div className="bg-gradient-to-b from-black to-emerald-950 min-h-screen flex items-center justify-center text-emerald-200">
        <ToastContainer toasts={toasts} />

        <div className="w-full max-w-md bg-black/70 backdrop-blur-xl border border-emerald-600/40 rounded-3xl p-8 shadow-emerald-xl shadow-2xl">
          <h1 className="text-4xl font-semibold text-emerald-400 text-center mb-4 drop-shadow-lg">
            MAMrr
          </h1>

          {/* Toggle LOGIN / SIGNUP */}
          <div className="flex justify-center gap-4 mb-6">
            <button
              onClick={() => setPage("login")}
              className={`px-4 py-1 rounded-full text-xs border ${
                page === "login"
                  ? "bg-emerald-500 text-black border-emerald-500"
                  : "border-emerald-600/40 text-emerald-300"
              }`}
            >
              Login
            </button>

            <button
              onClick={() => setPage("signup")}
              className={`px-4 py-1 rounded-full text-xs border ${
                page === "signup"
                  ? "bg-emerald-500 text-black border-emerald-500"
                  : "border-emerald-600/40 text-emerald-300"
              }`}
            >
              Sign Up
            </button>
          </div>

          {/* Error message */}
          {message && (
            <div className="mb-3 text-xs text-red-400 text-center">
              {message}
            </div>
          )}

          {/* ========================= LOGIN FORM ========================= */}
          {page === "login" && (
            <form onSubmit={handleLogin} className="space-y-3">
              <input
                className="w-full px-3 py-2 rounded-xl bg-black/70 border border-emerald-600/40 text-emerald-200 text-sm"
                placeholder="Username"
                value={loginForm.username}
                onChange={(e) =>
                  setLoginForm({ ...loginForm, username: e.target.value })
                }
              />

              <input
                type="password"
                className="w-full px-3 py-2 rounded-xl bg-black/70 border border-emerald-600/40 text-emerald-200 text-sm"
                placeholder="Password"
                value={loginForm.password}
                onChange={(e) =>
                  setLoginForm({ ...loginForm, password: e.target.value })
                }
              />

              <button
                type="submit"
                className="w-full py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-semibold"
              >
                Login
              </button>
            </form>
          )}

          {/* ========================= SIGNUP FORM ========================= */}
          {page === "signup" && (
            <form onSubmit={handleSignup} className="space-y-3">
              <input
                className="w-full px-3 py-2 rounded-xl bg-black/70 border border-emerald-600/40 text-emerald-200 text-sm"
                placeholder="New Username"
                value={signupForm.username}
                onChange={(e) =>
                  setSignupForm({ ...signupForm, username: e.target.value })
                }
              />

              <input
                type="password"
                className="w-full px-3 py-2 rounded-xl bg-black/70 border border-emerald-600/40 text-emerald-200 text-sm"
                placeholder="New Password"
                value={signupForm.password}
                onChange={(e) =>
                  setSignupForm({ ...signupForm, password: e.target.value })
                }
              />

              <input
                className="w-full px-3 py-2 rounded-xl bg-black/70 border border-emerald-600/40 text-emerald-200 text-sm"
                placeholder="Invite Code"
                value={signupForm.invite_code}
                onChange={(e) =>
                  setSignupForm({
                    ...signupForm,
                    invite_code: e.target.value,
                  })
                }
              />

              <button
                type="submit"
                className="w-full py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-semibold"
              >
                Create Account
              </button>
            </form>
          )}

          <div className="mt-3 text-[9px] text-center text-emerald-500/40">
            Unofficial — Powered by MyAnonamouse API
          </div>
        </div>
      </div>
    );
  }

  /* =============================
           SEARCH PAGE UI
  ============================== */
  return (
    <div className="bg-gradient-to-b from-black to-emerald-950 min-h-screen text-emerald-200 flex flex-col">
      <ToastContainer toasts={toasts} />

      {/* HEADER */}
      <header className="flex items-center justify-between px-6 py-4 bg-black/80 border-b border-emerald-600/20">
        <div>
          <h1 className="text-2xl font-semibold text-emerald-400 drop-shadow">
            MAMrr
          </h1>
          <p className="text-[10px] text-emerald-400/70">
            Search & Send Audiobooks Instantly
          </p>
        </div>

        <div className="flex items-center gap-3 text-xs">
          <div className="text-right">
            <div className="text-emerald-300">
              Logged in as{" "}
              <span className="text-emerald-400 font-semibold">
                {username}
              </span>
            </div>
          </div>

          <button
            onClick={logout}
            className="px-3 py-1 rounded-full border border-emerald-500/60 text-emerald-300 hover:bg-emerald-500 hover:text-black transition text-[10px]"
          >
            Logout
          </button>
        </div>
      </header>

      {/* SEARCH BAR */}
      <main className="flex-1 px-6 py-4">
        <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-3 mb-3">
          <input
            className="flex-1 px-4 py-2 rounded-2xl bg-black/80 border border-emerald-600/40 text-sm"
            placeholder="Search audiobooks…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />

          <select
            className="px-3 py-2 rounded-2xl bg-black/80 border border-emerald-600/40 text-xs"
            value={searchField}
            onChange={(e) => setSearchField(e.target.value)}
          >
            <option value="title">Title</option>
            <option value="author">Author</option>
            <option value="series">Series</option>
            <option value="narrator">Narrator</option>
          </select>

          <button
            type="submit"
            className="px-6 py-2 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-black font-semibold text-sm"
          >
            {loading ? "Searching…" : "Search"}
          </button>
        </form>

        {message && (
          <div className="mb-3 text-[10px] text-emerald-400">{message}</div>
        )}

        {/* RESULTS */}
        <div className="space-y-4">

          {/* Flat array (regrouped backend) */}
          {Array.isArray(results) && results.length > 0 && (
            <section className="border border-emerald-500/10 rounded-2xl p-3 bg-black/40">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {results.map((r) => (
                  <div
                    key={r.id}
                    className="bg-black/60 border border-emerald-500/15 rounded-2xl p-2 hover:border-emerald-500/50 transition"
                  >
                    <div className="aspect-[3/4] bg-black/40 rounded-xl mb-2 flex items-center justify-center overflow-hidden">
                      {r.cover ? (
                        <img
                          src={r.cover}
                          alt={r.title}
                          className="w-full h-full object-contain"
                        />
                      ) : (
                        <div className="text-[9px] text-emerald-300">No cover</div>
                      )}
                    </div>

                    <div className="text-xs font-semibold text-emerald-200 mb-1">
                      {r.title}
                    </div>

                    {r.author && (
                      <div className="text-[10px] text-emerald-300 mb-1">
                        {r.author}
                      </div>
                    )}

                    <div className="text-[9px] text-emerald-400">
                      {r.size} • Seeders {r.seeders}
                    </div>

                    <button
                      onClick={() => addTorrent(r.id, r.title)}
                      className="mt-2 w-full py-1.5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-black text-[10px] font-semibold"
                    >
                      Add to qBittorrent
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Series-based grouped results */}
          {!Array.isArray(results) &&
            Object.keys(results).map((seriesName) => (
              <section
                key={seriesName}
                className="border border-emerald-500/10 rounded-2xl p-3 bg-black/40"
              >
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-sm font-semibold text-emerald-400">
                    {seriesName}
                  </h2>
                  <span className="text-[9px] text-emerald-300">
                    {results[seriesName].length} items
                  </span>
                </div>

                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {results[seriesName].map((r) => (
                    <div
                      key={r.id}
                      className="bg-black/60 border border-emerald-500/15 rounded-2xl p-2 hover:border-emerald-500/50 transition"
                    >
                      <div className="aspect-[3/4] bg-black/40 rounded-xl mb-2 flex items-center justify-center overflow-hidden">
                        {r.cover ? (
                          <img
                            src={r.cover}
                            alt={r.title}
                            className="w-full h-full object-contain"
                          />
                        ) : (
                          <div className="text-[9px] text-emerald-300">
                            No cover
                          </div>
                        )}
                      </div>

                      <div className="text-xs font-semibold text-emerald-200 mb-1">
                        {r.title}
                      </div>

                      {r.author && (
                        <div className="text-[10px] text-emerald-300 mb-1">
                          {r.author}
                        </div>
                      )}

                      <div className="text-[9px] text-emerald-400">
                        {r.size} • Seeders {r.seeders}
                      </div>

                      <button
                        onClick={() => addTorrent(r.id, r.title)}
                        className="mt-2 w-full py-1.5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-black text-[10px] font-semibold"
                      >
                        Add to qBittorrent
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            ))}
        </div>

        <div className="mt-6 text-[9px] text-emerald-500/40 text-center">
          Unofficial — Powered by MyAnonamouse API
        </div>
      </main>
    </div>
  );
}