import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { authApi, type UserProfile } from "@/lib/api/auth";
import { getApiErrorMessage } from "@/lib/api/errors";

export const AUTH_QUERY_KEY = ["auth", "me"] as const;

export function useAuth() {
  const queryClient = useQueryClient();

  const meQuery = useQuery({
    queryKey: AUTH_QUERY_KEY,
    queryFn: async () => {
      try {
        const res = await authApi.me();
        return res.data.user;
      } catch (err) {
        if (isAxiosError(err) && err.response?.status === 401) {
          return null;
        }
        throw err;
      }
    },
    retry: false,
    staleTime: 60_000,
  });

  const logoutMutation = useMutation({
    mutationFn: () => authApi.logout(),
    onSuccess: () => {
      queryClient.setQueryData<UserProfile | null>(AUTH_QUERY_KEY, null);
    },
  });

  const setUser = (user: UserProfile | null) => {
    queryClient.setQueryData(AUTH_QUERY_KEY, user);
  };

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: AUTH_QUERY_KEY });

  return {
    user: meQuery.data ?? null,
    isLoading: meQuery.isLoading,
    isAuthenticated: meQuery.data != null,
    error: meQuery.error ? getApiErrorMessage(meQuery.error) : null,
    refetch: meQuery.refetch,
    setUser,
    invalidate,
    logout: logoutMutation.mutateAsync,
    isLoggingOut: logoutMutation.isPending,
  };
}
