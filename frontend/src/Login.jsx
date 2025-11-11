import React, { useState } from "react";

export default function Login({ onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5747";

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");

    try {
      const res = await fetch(`${API_URL}/api/login`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ username, password }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const msg =
          data.detail || data.message || `Login failed (${res.status})`;
        throw new Error(msg);
      }

      const data = await res.json();
      const token = data.access_token;
      if (!token) throw new Error("No token received from server.");

      localStorage.setItem("token", token);
      if (onLogin) onLogin(token);
    } catch (err) {
      console.error("Login error:", err);
      setError(err.message || "Unexpected login error");
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white">
      <div className="bg-gray-800 p-8 rounded-xl shadow-lg w-80">
        <h1 className="text-2xl mb-4 font-bold text-center">Login</h1>

        <form onSubmit={handleLogin} className="flex flex-col gap-4">
          <input
            type="text"
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="p-2 rounded bg-gray-700 border border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="p-2 rounded bg-gray-700 border border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-400"
          />

          <button
            type="submit"
            className="p-2 bg-blue-600 rounded hover:bg-blue-700 transition"
          >
            Sign In
          </button>
        </form>

        {error && (
          <div className="text-red-400 mt-4 text-sm text-center">
            {String(error)}
          </div>
        )}
      </div>
    </div>
  );
}