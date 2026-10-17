import { RouterProvider } from "react-router-dom";

import ToastProvider from "../components/ui/ToastProvider.jsx";
import { AuthProvider } from "../features/auth/AuthProvider.jsx";

import router from "./router.jsx";

function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </ToastProvider>
  );
}

export default App;
