import { redirect } from "@tanstack/react-router";
import { authApi } from "@/lib/api/auth";
import { AUTH_QUERY_KEY } from "@/hooks/use-auth";

export async function requireAuth(queryClient: {
  fetchQuery: (opts: {
    queryKey: readonly string[];
    queryFn: () => Promise<unknown>;
  }) => Promise<unknown>;
}) {
  try {
    const user = await queryClient.fetchQuery({
      queryKey: AUTH_QUERY_KEY,
      queryFn: async () => {
        const res = await authApi.me();
        return res.data.user;
      },
    });
    return user;
  } catch {
    throw redirect({ to: "/login" });
  }
}
