import React, { useState, useEffect } from "react";

const API_URL = import.meta.env.VITE_API_URL || "http://10.1.1.161:5747";

function App() {
  const [page, setPage] = useState("login");
  const [token, setToken] = useState(localStorage.getItem("mam_token") || "");
  const [username, setUsername] = useState("");
  const [loginForm, setLoginForm] = useState({ username: "", password: "" });
  const [searchTerm, setSearchTerm] = useState("");
  const [searchField, setSearchField] = useState("title");
  const [results, setResults] = useState([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [toasts, setToasts] = useState([]);

  // --- Toast System ---
  const showToast = (text, type = "info", duration = 4000) => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, text, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, duration);
  };

  const ToastContainer = () => (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 w-72">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`toast animate-toastSlideIn p-3 rounded-xl shadow-lg text-sm text-white ${
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

  // --- Auth ---
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
      } else logout();
    } catch {
      logout();
    }
  }

  function logout() {
    localStorage.removeItem("mam_token");
    setToken("");
    setPage("login");
    setUsername("");
    setResults([]);
  }

  // --- Login ---
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
      } else setMessage(data.detail || "Login failed");
    } catch {
      setMessage("Error logging in");
    }
  }

  // --- Search ---
  async function handleSearch(e) {
    e.preventDefault();
    if (!searchTerm.trim()) return;
    setMessage("");
    setLoading(true);

    try {
      const res = await fetch(
        `${API_URL}/api/search?q=${encodeURIComponent(searchTerm)}&field=${searchField}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const data = await res.json().catch(() => []);
      if (res.ok) {
        setResults(Array.isArray(data) ? data : []);
        if (!data.length) setMessage("No results found.");
      } else setMessage(data.detail || "Search failed");
    } catch {
      setMessage("Error searching");
    } finally {
      setLoading(false);
    }
  }

  // --- Add torrent ---
  async function addTorrent(tid) {
    showToast(`Adding torrent ${tid}...`, "info");
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
      if (res.ok) showToast(`✅ Torrent ${tid} added successfully!`, "success");
      else showToast(`❌ ${data.detail || "Failed to add torrent"}`, "error");
    } catch {
      showToast("⚠️ Error adding torrent", "error");
    }
  }

  const gradientBg = "bg-gradient-to-b from-black via-[#130814] to-black";

  // --- Login Page ---
  if (page === "login") {
    return (
      <div className={`${gradientBg} min-h-screen flex items-center justify-center text-roseSoft`}>
        <ToastContainer />
        <div className="w-full max-w-md bg-black/70 border border-rose/40 rounded-3xl p-8 shadow-2xl">
          <h1 className="text-3xl font-serif text-center mb-6">MAM Library</h1>
          {message && <div className="text-xs text-red-400 mb-3 text-center">{message}</div>}
          <form onSubmit={handleLogin} className="space-y-3">
            <input
              className="w-full px-3 py-2 rounded-xl bg-black/60 border border-rose/40 text-sm focus:outline-none focus:ring-2 focus:ring-rose"
              placeholder="Username"
              value={loginForm.username}
              onChange={(e) => setLoginForm({ ...loginForm, username: e.target.value })}
            />
            <input
              type="password"
              className="w-full px-3 py-2 rounded-xl bg-black/60 border border-rose/40 text-sm focus:outline-none focus:ring-2 focus:ring-rose"
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

  // --- Search Page ---
  return (
    <div className={`${gradientBg} min-h-screen text-roseSoft flex flex-col`}>
      <ToastContainer />

      <header className="flex items-center justify-between px-6 py-4 bg-black/60 border-b border-rose/30">
        <div>
          <h1 className="text-2xl font-serif">MAM Library</h1>
          <p className="text-xs text-roseSoft/70">Whispers, pages, and midnight audiobooks.</p>
        </div>
        <div className="text-xs text-right">
          <div className="text-roseSoft/80">
            Signed in as <span className="font-semibold">{username}</span>
          </div>
          <button
            onClick={logout}
            className="mt-1 px-3 py-1 rounded-full border border-rose/60 text-roseSoft/80 hover:bg-rose/80 hover:text-black transition"
          >
            Logout
          </button>
        </div>
      </header>

      <main className="flex-1 px-6 py-4 relative">
        {loading && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-4 border-rose/50 border-t-transparent mx-auto mb-4"></div>
              <p className="text-roseSoft font-serif text-lg">Searching for Audiobooks…</p>
            </div>
          </div>
        )}

        <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-3 mb-4">
          <input
            className="flex-1 px-4 py-2 rounded-2xl bg-black/70 border border-rose/40 text-sm focus:outline-none focus:ring-2 focus:ring-rose"
            placeholder="Search audiobooks..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <select
            className="px-3 py-2 rounded-2xl bg-black/70 border border-rose/40 text-sm focus:outline-none focus:ring-2 focus:ring-rose text-roseSoft"
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

        {message && <div className="mb-3 text-xs text-roseSoft/80">{message}</div>}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {results.map((r) => (
            <div
              key={r.id}
              className="bg-black/70 border border-rose/20 rounded-2xl p-3 hover:border-rose/60 transition flex flex-col justify-between"
            >
              {r.cover && (
                <a href={r.infoUrl} target="_blank" rel="noopener noreferrer">
                  <img
                    src={r.cover}
                    alt={r.title}
                    className="rounded-xl mb-3 w-full h-72 object-cover object-center shadow-lg"
                  />
                </a>
              )}
              <div className="flex-1">
                <div className="text-base font-serif text-roseSoft mb-1">{r.title}</div>
                {r.author && (
                  <div className="text-xs text-roseSoft/80 mb-0.5">
                    <span className="font-semibold">Author:</span> {r.author}
                  </div>
                )}
                {r.series && (
                  <div className="text-xs italic text-roseSoft/70 mb-0.5">{r.series}</div>
                )}
                <div className="text-[10px] text-roseSoft/70">
                  {r.category} • {r.size || "Unknown size"}
                </div>
                <div className="text-[10px] text-roseSoft/60 mt-1">
                  Seeders: {r.seeders} • Filetypes: {r.filetypes || "n/a"}
                </div>
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