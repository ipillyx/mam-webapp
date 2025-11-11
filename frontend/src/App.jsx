import React, { useState, useEffect } from "react";

const API_URL = import.meta.env.VITE_API_URL || "http://10.1.1.161:5747";

function App() {
  const [page, setPage] = useState("login");
  const [token, setToken] = useState(localStorage.getItem("mam_token") || "");
  const [username, setUsername] = useState("");
  const [loginForm, setLoginForm] = useState({ username: "", password: "" });
  const [registerForm, setRegisterForm] = useState({ username: "", password: "", invite_code: "" });
  const [searchTerm, setSearchTerm] = useState("");
  const [searchField, setSearchField] = useState("title");
  const [results, setResults] = useState([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [toasts, setToasts] = useState([]);

  const addToast = (text, type = "info") => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, text, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  };

  useEffect(() => {
    if (token) fetchMe(token);
  }, []);

  async function fetchMe(tok) {
    try {
      const res = await fetch(`${API_URL}/api/me`, {
        headers: { Authorization: `Bearer ${tok}` },
      });
      if (res.ok) {
        const data = await res.json();
        setUsername(data.username);
        setPage("search");
      } else {
        logout();
      }
    } catch (e) {
      console.error("fetchMe error:", e);
      logout();
    }
  }

  function logout() {
    setToken("");
    localStorage.removeItem("mam_token");
    setPage("login");
    setUsername("");
    setResults([]);
  }

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
        body: formData.toString(),
      });

      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        localStorage.setItem("mam_token", data.access_token);
        setToken(data.access_token);
        await fetchMe(data.access_token);
      } else {
        setMessage(String(data.detail || "Login failed"));
        addToast("❌ Invalid login credentials", "error");
      }
    } catch (err) {
      console.error("Login error:", err);
      setMessage("Error logging in");
      addToast("⚠️ Error logging in", "error");
    }
  }

  async function handleSearch(e) {
    e.preventDefault();
    setMessage("");
    if (!searchTerm.trim()) return;
    setLoading(true);
    addToast("🔍 Searching for audiobooks...", "info");

    try {
      const res = await fetch(
        `${API_URL}/api/search?q=${encodeURIComponent(searchTerm)}&field=${searchField}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const data = await res.json().catch(() => []);
      if (res.ok) {
        setResults(Array.isArray(data) ? data : []);
        if (!data.length) setMessage("No results found.");
      } else {
        setMessage(String(data.detail || "Search failed"));
      }
    } catch (err) {
      console.error("Search error:", err);
      setMessage("Error searching");
      addToast("⚠️ Error searching", "error");
    } finally {
      setLoading(false);
    }
  }

  async function addTorrent(tid) {
    addToast(`📤 Sending torrent ${tid} to qBittorrent...`, "info");
    try {
      const res = await fetch(`${API_URL}/api/add`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ tid }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        addToast(`✅ Torrent ${tid} added successfully!`, "success");
      } else {
        addToast(`❌ ${String(data.detail || "Failed to add torrent")}`, "error");
      }
    } catch (err) {
      console.error("Add torrent error:", err);
      addToast("⚠️ Error adding torrent", "error");
    }
  }

  const ToastContainer = () => (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 w-72">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`animate-toastSlideIn p-3 rounded-xl shadow-lg text-sm text-white ${
            toast.type === "success"
              ? "bg-green-600"
              : toast.type === "error"
              ? "bg-red-600"
              : "bg-rose/80"
          }`}
        >
          {toast.text}
        </div>
      ))}
    </div>
  );

  if (page === "login") {
    return (
      <div className="bg-black min-h-screen flex items-center justify-center text-roseSoft">
        <ToastContainer />
        <div className="w-full max-w-md bg-black/70 border border-rose/40 rounded-3xl p-8 shadow-2xl">
          <h1 className="text-3xl font-serif text-roseSoft text-center mb-6">MAM Library</h1>
          <p className="text-sm text-center mb-4 text-roseSoft/80">Sign in to your private audiobook portal.</p>
          {message && <div className="mb-3 text-xs text-red-400 text-center">{String(message)}</div>}
          <form onSubmit={handleLogin} className="space-y-3">
            <input
              className="w-full px-3 py-2 rounded-xl bg-black/60 border border-rose/40 text-roseSoft text-sm focus:outline-none focus:ring-2 focus:ring-rose"
              placeholder="Username"
              value={loginForm.username}
              onChange={(e) => setLoginForm({ ...loginForm, username: e.target.value })}
            />
            <input
              type="password"
              className="w-full px-3 py-2 rounded-xl bg-black/60 border border-rose/40 text-roseSoft text-sm focus:outline-none focus:ring-2 focus:ring-rose"
              placeholder="Password"
              value={loginForm.password}
              onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
            />
            <button
              type="submit"
              className="w-full py-2 mt-1 rounded-xl bg-rose/80 hover:bg-rose transition text-black font-semibold text-sm"
            >
              Login
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-black min-h-screen text-roseSoft flex flex-col">
      <ToastContainer />
      <header className="flex items-center justify-between px-6 py-4 bg-black/60 border-b border-rose/30">
        <div>
          <h1 className="text-2xl font-serif text-roseSoft">MAM Library</h1>
          <p className="text-xs text-roseSoft/70">Whispers, pages, and midnight audiobooks.</p>
        </div>
        <div className="text-right text-xs">
          <div className="text-roseSoft/80">Signed in as <span className="font-semibold">{username}</span></div>
          <button
            onClick={logout}
            className="mt-1 px-3 py-1 rounded-full border border-rose/60 text-roseSoft/80 hover:bg-rose/80 hover:text-black transition"
          >
            Logout
          </button>
        </div>
      </header>

      <main className="flex-1 px-6 py-4 animate-fadeIn">
        <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-3 mb-4">
          <input
            className="flex-1 px-4 py-2 rounded-2xl bg-black/70 border border-rose/40 text-sm focus:outline-none focus:ring-2 focus:ring-rose"
            placeholder="Search..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <select
            className="px-3 py-2 rounded-2xl bg-black/70 border border-rose/40 text-sm text-roseSoft"
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
            className="px-6 py-2 rounded-2xl bg-rose/80 hover:bg-rose transition text-black font-semibold text-sm"
          >
            {loading ? "Searching..." : "Search"}
          </button>
        </form>

        {message && <div className="mb-3 text-xs text-roseSoft/80">{String(message)}</div>}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {results.map((r) => (
            <div
              key={r.id}
              className="card-hover bg-black/70 border border-rose/20 rounded-2xl p-3 hover:border-rose/60 transition flex flex-col justify-between animate-fadeIn"
            >
              <div className="relative flex justify-center items-center bg-black/40 rounded-xl overflow-hidden mb-3 aspect-[3/4]">
                <img
                  src={r.cover}
                  alt={r.title}
                  className="w-full h-full object-contain p-2 transition-transform duration-300 hover:scale-105"
                />
              </div>

              <div className="flex-1">
                <div className="text-sm font-serif text-roseSoft mb-1">{r.title}</div>
                {r.author && <div className="text-xs text-roseSoft/80 mb-0.5"><span className="font-semibold">Author:</span> {r.author}</div>}
                {r.series && <div className="text-xs italic text-roseSoft/70 mb-0.5">{r.series}</div>}
                <div className="text-[10px] text-roseSoft/70">{r.category} • {r.size || "Unknown size"}</div>
                <div className="text-[10px] text-roseSoft/60 mt-1">Seeders: {r.seeders} • Filetypes: {r.filetypes || "n/a"}</div>
              </div>

              <div className="mt-3">
                <button
                  onClick={() => addTorrent(r.id)}
                  className="w-full py-1.5 rounded-2xl bg-rose/80 hover:bg-rose transition text-black text-xs font-semibold"
                >
                  Add to qBittorrent
                </button>
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}

export default App;