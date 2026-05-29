import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ShadowInput } from "@/components/shadow/Input";
import { authApi } from "@/lib/api/auth";
import { getApiErrorMessage } from "@/lib/api/errors";
import { AUTH_QUERY_KEY } from "@/hooks/use-auth";
import type { UserProfile } from "@/lib/api/auth";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Enter — SHADOWCOACH" }] }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await authApi.login({ email, password });
      queryClient.setQueryData<UserProfile | null>(
        AUTH_QUERY_KEY,
        res.data.user ?? null,
      );
      toast.success("Welcome back.");
      navigate({ to: "/analyze" });
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Login failed"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="min-h-[calc(100vh-6rem)] flex items-center justify-center px-6">
      <motion.form
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1, ease: "easeOut" }}
        onSubmit={onSubmit}
        className="w-full max-w-sm space-y-10"
      >
        <div>
          <div className="text-[10px] uppercase tracking-command text-smoke">Step One</div>
          <h1 className="mt-3 text-2xl uppercase tracking-command text-white font-bold">
            Enter the chamber
          </h1>
        </div>

        <div className="space-y-8">
          <ShadowInput
            label="Email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@dojo.io"
          />
          <ShadowInput
            label="Password"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-white text-black py-4 text-xs font-bold uppercase tracking-command hover:opacity-80 transition-opacity duration-500 disabled:opacity-50"
        >
          {loading ? "Entering..." : "Submit"}
        </button>

        <Link
          to="/register"
          className="block text-center text-[11px] uppercase tracking-command text-smoke hover:text-white transition-colors"
        >
          No account? Begin your training
        </Link>
      </motion.form>
    </section>
  );
}
