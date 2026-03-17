import { Card, CardHeader } from "@/components/ui/card";
import { requirePlatformAdminAccess } from "@/lib/auth/guards";
import { listPlatformAdminUsersData } from "@/lib/data/platform-admin";
import { PlatformAdminUsersDashboard } from "@/components/platform/platform-admin-users-dashboard";

export default async function PlatformAdminUsersPage() {
  await requirePlatformAdminAccess();
  const { users, roles, canManageUsers } = await listPlatformAdminUsersData();

  return (
    <Card>
      <CardHeader
        title="Platform Users & Roles"
        subtitle={
          canManageUsers
            ? "Create platform users and assign platform roles."
            : "Read-only view of platform users and role assignments."
        }
      />
      <PlatformAdminUsersDashboard
        initialUsers={users}
        roles={roles}
        canManageUsers={canManageUsers}
      />
    </Card>
  );
}
