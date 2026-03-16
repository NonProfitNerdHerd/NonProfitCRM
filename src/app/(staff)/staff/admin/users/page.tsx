import { Card, CardHeader } from "@/components/ui/card";
import { requireStaffPermission } from "@/lib/auth/guards";
import { listAdminUsersData } from "@/lib/data/admin-users";
import { UsersManagement } from "@/components/admin/users-management";

export default async function UserManagementPage() {
  await requireStaffPermission("can_view_users");
  const { users, roles, canManageUsers } = await listAdminUsersData();

  return (
    <Card>
      <CardHeader
        title="User Management"
        subtitle={
          canManageUsers
            ? "Create users, assign roles, and manage active status"
            : "Read-only view of users and role assignments"
        }
      />
      <UsersManagement
        initialUsers={users}
        roles={roles}
        canManageUsers={canManageUsers}
      />
    </Card>
  );
}
