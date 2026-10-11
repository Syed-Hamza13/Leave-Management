import {
  createBrowserRouter,
  Navigate,
} from "react-router-dom";

import ProtectedRoute from "../components/auth/ProtectedRoute.jsx";
import AppShell from "../layouts/AppShell.jsx";

import LoginPage from "../features/auth/LoginPage.jsx";
import DashboardPage from "../features/dashboard/DashboardPage.jsx";

const router = createBrowserRouter([
  {
    path: "/login",
    element: <LoginPage />,
  },

  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <AppShell />,
        children: [
          {
            path: "/",
            element: <DashboardPage />,
          },
        ],
      },
    ],
  },

  {
    path: "*",
    element: <Navigate to="/" replace />,
  },
]);

export default router;