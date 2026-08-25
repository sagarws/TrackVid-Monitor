"use client";

// React Imports
import { useCallback, useEffect, useRef, useState } from "react";

// MUI Imports
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Typography from "@mui/material/Typography";

// Config Imports
import type { PlatformKey as FilterPlatformKey } from "@/configs/platforms";

type Props = {
  open: boolean;
  onClose: () => void;
  companyId: string;
  platform: FilterPlatformKey;
  // "Myntra" / "Ajio" — the display name, for the dialog title.
  platformLabel: string;
  credentialId: string;
  username: string;
};

// The cached cookie jar of ONE credential, as stored in the DB.
//
// Fetched on open rather than shipped with the company list: the body holds
// live marketplace auth cookies (Myntra's `erp.at`, Flipkart's csrf token, the
// AJIO Reliance-SSO jar), so it reaches the browser only for the one account an
// operator explicitly opened, and the BE logs every such read against the
// caller. The list itself continues to carry only the expiry summary.
const SessionJsonDialog = ({
  open,
  onClose,
  companyId,
  platform,
  platformLabel,
  credentialId,
  username,
}: Props) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<unknown>(null);
  const [copied, setCopied] = useState<"idle" | "copied" | "failed">("idle");

  // Guards against an out-of-order response: the dialog can be closed and
  // reopened on another credential while the first fetch is still in flight,
  // and the slower reply would otherwise paint one account's jar under the
  // other account's name.
  const reqIdRef = useRef(0);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    const reqId = ++reqIdRef.current;

    setLoading(true);
    setError(null);
    setSession(null);

    try {
      const res = await fetch("/api/company/credential-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId, platform, credentialId }),
      });

      const json = await res.json().catch(() => null);

      if (reqId !== reqIdRef.current) return;

      if (!res.ok || !json?.isSuccess) {
        setError(
          json?.displayMessage ||
            json?.message ||
            `Request failed (${res.status})`,
        );

        return;
      }

      setSession(json?.data?.session ?? null);
    } catch (err: any) {
      if (reqId !== reqIdRef.current) return;
      setError(err?.message || "Failed to read session");
    } finally {
      if (reqId === reqIdRef.current) setLoading(false);
    }
  }, [companyId, platform, credentialId]);

  useEffect(() => {
    if (open) load();
    // A closed dialog drops the jar rather than keeping it in memory behind a
    // hidden component — the reason for looking at it has passed.
    else {
      reqIdRef.current++;
      setSession(null);
      setError(null);
      setLoading(false);
    }
  }, [open, load]);

  useEffect(
    () => () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    },
    [],
  );

  const text = session ? JSON.stringify(session, null, 2) : "";

  const flash = (next: "copied" | "failed") => {
    setCopied(next);
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    copyTimerRef.current = setTimeout(() => setCopied("idle"), 1500);
  };

  const copy = () => {
    // Clipboard access is denied outside a secure context; say so on the button
    // rather than leaving it looking broken.
    if (!text || !navigator.clipboard?.writeText) {
      flash("failed");

      return;
    }

    navigator.clipboard
      .writeText(text)
      .then(() => flash("copied"))
      .catch(() => flash("failed"));
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle className="flex flex-col gap-1">
        <span>{platformLabel} session</span>
        <Typography
          variant="body2"
          color="text.secondary"
          className="break-all"
        >
          {username}
        </Typography>
      </DialogTitle>
      <DialogContent>
        {loading ? (
          <div className="flex items-center gap-2 plb-4">
            <CircularProgress size={18} />
            <Typography variant="body2" color="text.secondary">
              Reading the stored session…
            </Typography>
          </div>
        ) : error ? (
          <Alert severity="error">{error}</Alert>
        ) : session ? (
          <div className="flex flex-col gap-3">
            <Alert severity="warning">
              This is the session as stored — the cookie values below are live{" "}
              {platformLabel} credentials. Anyone holding them can act as this
              seller until the session expires.
            </Alert>
            <pre className="bg-actionHover rounded border plb-3 pli-4 overflow-auto max-bs-[440px] text-xs font-mono whitespace-pre">
              {text}
            </pre>
          </div>
        ) : (
          <Typography variant="body2" color="text.secondary" className="plb-4">
            No session stored for this account yet — run Renew to log in and
            cache one.
          </Typography>
        )}
      </DialogContent>
      <DialogActions>
        {/* Re-read rather than reopen: a Renew in another tab (or the row's own
            Renew) replaces the jar, and the dialog would keep showing the dead
            one. */}
        <Button
          color="secondary"
          startIcon={<i className="tabler-refresh" />}
          onClick={load}
          disabled={loading}
        >
          Reload
        </Button>
        <Button
          color="secondary"
          startIcon={
            <i
              className={
                copied === "copied"
                  ? "tabler-check text-success"
                  : copied === "failed"
                    ? "tabler-x text-error"
                    : "tabler-copy"
              }
            />
          }
          onClick={copy}
          disabled={!text}
        >
          {copied === "copied"
            ? "Copied"
            : copied === "failed"
              ? "Clipboard blocked"
              : "Copy JSON"}
        </Button>
        <Button variant="contained" onClick={onClose}>
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default SessionJsonDialog;
