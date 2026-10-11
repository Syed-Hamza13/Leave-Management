import { useAuth } from "../auth/AuthProvider.jsx";

function DashboardPage() {
  const { user } = useAuth();

  const fullName =
    [user?.firstName, user?.lastName]
      .filter(Boolean)
      .join(" ") || user?.email;

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <div className="mb-8">
        <h2 className="text-2xl font-semibold text-gray-900">
          Dashboard
        </h2>

        <p className="mt-2 text-sm text-gray-600">
          Welcome back, {fullName}.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <p className="text-sm text-gray-500">
            Authentication
          </p>

          <p className="mt-2 text-lg font-semibold text-green-600">
            Active
          </p>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <p className="text-sm text-gray-500">
            Account Status
          </p>

          <p className="mt-2 text-lg font-semibold text-gray-900">
            {user?.status}
          </p>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <p className="text-sm text-gray-500">
            User ID
          </p>

          <p className="mt-2 text-lg font-semibold text-gray-900">
            {user?.id}
          </p>
        </div>
      </div>
    </div>
  );
}

export default DashboardPage;