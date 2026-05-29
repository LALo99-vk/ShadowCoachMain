import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useState } from "react";
import { toast } from "sonner";
import { ShadowInput, ShadowSelect } from "@/components/shadow/Input";
import { authApi, type ExperienceLevel, type Sport } from "@/lib/api/auth";
import { getApiErrorMessage } from "@/lib/api/errors";

export const Route = createFileRoute("/register")({
  head: () => ({ meta: [{ title: "Begin Training — SHADOWCOACH" }] }),
  component: RegisterPage,
});

const SPORTS: { label: string; value: Sport }[] = [
  { label: "Cricket", value: "CRICKET" },
  { label: "Football", value: "FOOTBALL" },
  { label: "Basketball", value: "BASKETBALL" },
  { label: "Badminton", value: "BADMINTON" },
];

const LEVELS: { label: string; value: ExperienceLevel }[] = [
  { label: "Beginner", value: "BEGINNER" },
  { label: "Intermediate", value: "INTERMEDIATE" },
  { label: "Advanced", value: "ADVANCED" },
];

function RegisterPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    fullName: "",
    email: "",
    password: "",
    age: "18",
    country: "",
    state: "",
    sport: SPORTS[0].value,
    role: "",
    level: LEVELS[0].value,
  });
  const [loading, setLoading] = useState(false);

  const set =
    (k: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm({ ...form, [k]: e.target.value });

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await authApi.register({
        fullName: form.fullName,
        email: form.email,
        password: form.password,
        age: Number(form.age),
        country: form.country,
        state: form.state,
        sport: form.sport as Sport,
        role: form.role,
        level: form.level as ExperienceLevel,
      });
      toast.success("Account created. Enter the chamber.");
      navigate({ to: "/login" });
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Registration failed"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="min-h-[calc(100vh-6rem)] flex items-center justify-center px-6 py-12">
      <motion.form
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1, ease: "easeOut" }}
        onSubmit={onSubmit}
        className="w-full max-w-md space-y-10"
      >
        <div>
          <div className="text-[10px] uppercase tracking-command text-smoke">Initiation</div>
          <h1 className="mt-3 text-2xl uppercase tracking-command text-white font-bold">
            Begin your training
          </h1>
          <p className="mt-3 text-[10px] tracking-command text-smoke leading-relaxed">
            Password must be 8+ characters with upper, lower, number, and special (!@#$%^&*)
          </p>
        </div>

        <div className="space-y-7">
          <ShadowInput
            label="Full Name"
            required
            value={form.fullName}
            onChange={set("fullName")}
            placeholder="Your name"
          />
          <ShadowInput
            label="Email"
            type="email"
            required
            value={form.email}
            onChange={set("email")}
            placeholder="name@dojo.io"
          />
          <ShadowInput
            label="Password"
            type="password"
            required
            value={form.password}
            onChange={set("password")}
            placeholder="••••••••"
          />
          <ShadowInput
            label="Age"
            type="number"
            required
            min={1}
            max={120}
            value={form.age}
            onChange={set("age")}
            placeholder="21"
          />
          <ShadowInput
            label="Country"
            required
            value={form.country}
            onChange={set("country")}
            placeholder="India"
          />
          <ShadowInput
            label="State"
            required
            value={form.state}
            onChange={set("state")}
            placeholder="Karnataka"
          />
          <ShadowSelect
            label="Sport"
            options={SPORTS.map((s) => s.label)}
            value={SPORTS.find((s) => s.value === form.sport)?.label ?? SPORTS[0].label}
            onChange={(e) => {
              const sport = SPORTS.find((s) => s.label === e.target.value);
              if (sport) setForm({ ...form, sport: sport.value });
            }}
          />
          <ShadowInput
            label="Role / Position"
            required
            value={form.role}
            onChange={set("role")}
            placeholder="Batsman, striker, point guard..."
          />
          <ShadowSelect
            label="Experience Level"
            options={LEVELS.map((l) => l.label)}
            value={LEVELS.find((l) => l.value === form.level)?.label ?? LEVELS[0].label}
            onChange={(e) => {
              const level = LEVELS.find((l) => l.label === e.target.value);
              if (level) setForm({ ...form, level: level.value });
            }}
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-white text-black py-4 text-xs font-bold uppercase tracking-command hover:opacity-80 transition-opacity duration-500 disabled:opacity-50"
        >
          {loading ? "Enlisting..." : "Enlist"}
        </button>

        <Link
          to="/login"
          className="block text-center text-[11px] uppercase tracking-command text-smoke hover:text-white transition-colors"
        >
          Already trained? Return
        </Link>
      </motion.form>
    </section>
  );
}
