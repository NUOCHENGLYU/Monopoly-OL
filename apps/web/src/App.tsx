import { useEffect, useState } from "react";

type HealthResponse = {
  ok: boolean;
};

type HealthStatus = "loading" | "ok" | "error";

export default function App() {
  const [status, setStatus] = useState<HealthStatus>("loading");
  const [message, setMessage] = useState<string>("");

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        const res = await fetch("/health");
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const data = (await res.json()) as HealthResponse;
        if (!active) return;
        if (data.ok) {
          setStatus("ok");
          setMessage("");
        } else {
          setStatus("error");
          setMessage("Unexpected response");
        }
      } catch (err) {
        if (!active) return;
        setStatus("error");
        setMessage(err instanceof Error ? err.message : "Unknown error");
      }
    };

    load();

    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="page">
      <header className="hero">
        <p className="eyebrow">Property Tycoon</p>
        <h1>Online multiplayer board game in progress</h1>
        <p className="subhead">
          Milestone A: server health check + web shell.
        </p>
      </header>

      <section className="card">
        <h2>Server status</h2>
        {status === "loading" && <p className="status">Checking...</p>}
        {status === "ok" && <p className="status ok">Server: OK</p>}
        {status === "error" && (
          <p className="status error">Server: ERROR {message}</p>
        )}
      </section>
    </div>
  );
}
