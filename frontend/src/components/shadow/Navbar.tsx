import { Link, useRouterState } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { getApiErrorMessage } from "@/lib/api/errors";

export function Navbar() {
  const { location } = useRouterState();
  const { isAuthenticated, user, logout, isLoggingOut } = useAuth();

  const links = [
    { to: "/", label: "Home" },
    ...(isAuthenticated
      ? [
          { to: "/analyze", label: "Analyze" },
          { to: "/sessions", label: "History" },
        ]
      : []),
  ] as const;

  const handleLogout = async () => {
    try {
      await logout();
      toast.success("Logged out.");
      window.location.href = "/";
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Logout failed"));
    }
  };

  return (
    <nav className="fixed top-0 left-0 right-0 z-40 px-8 py-6 flex items-center justify-between bg-black/40 backdrop-blur-sm">
      <Link to="/" className="text-sm font-bold uppercase tracking-command text-white">
        Shadowcoach
      </Link>
      <div className="flex items-center gap-8 md:gap-10">
        {links.map((l) => {
          const active = location.pathname === l.to;
          return (
            <Link
              key={l.to}
              to={l.to}
              className={cn(
                "text-[11px] uppercase tracking-command transition-colors duration-300",
                active ? "text-white" : "text-smoke hover:text-white",
              )}
            >
              {l.label}
            </Link>
          );
        })}
        {isAuthenticated ? (
          <>
            <span className="hidden md:inline text-[10px] uppercase tracking-command text-smoke max-w-[120px] truncate">
              {user?.fullName}
            </span>
            <button
              type="button"
              onClick={handleLogout}
              disabled={isLoggingOut}
              className="text-[11px] uppercase tracking-command text-smoke hover:text-white transition-colors disabled:opacity-50"
            >
              Exit
            </button>
          </>
        ) : (
          <Link
            to="/login"
            className={cn(
              "text-[11px] uppercase tracking-command transition-colors duration-300",
              location.pathname === "/login" ? "text-white" : "text-smoke hover:text-white",
            )}
          >
            Enter
          </Link>
        )}
      </div>
    </nav>
  );
}
