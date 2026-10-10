import {
  createBrowserRouter,
  Navigate,
} from "react-router-dom";

import ProtectedRoute from "../components/auth/ProtectedRoute.jsx";
import LoginPage from "../features/auth/LoginPage.jsx";

function HomePage() {
  return (
    <main className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-2xl font-semibold">
          Leave Management System
        </h1>

        <p className="mt-2 text-gray-600">
          Authentication successful.
        </p>
      </div>
    </main>
  );
}

const router = createBrowserRouter([
  {
    path: "/login",
    element: <LoginPage />,
  },

  {
    element: <ProtectedRoute />,
    children: [
      {
        path: "/",
        element: <HomePage />,
      },
    ],
  },

  {
    path: "*",
    element: <Navigate to="/" replace />,
  },
]);

export default router;