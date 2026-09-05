import { create } from "zustand";
import * as authApi from "../api/auth";

const useAuthStore = create((set) => ({
  user: null,
  isAuthenticated: false,

  login: async (email, password) => {
    const { token, user } = await authApi.login(email, password);
    localStorage.setItem("churchcast_token", token);
    set({ user, isAuthenticated: true });
    return user;
  },

  logout: () => {
    localStorage.removeItem("churchcast_token");
    set({ user: null, isAuthenticated: false });
  },
}));

export default useAuthStore;