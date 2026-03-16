import { Card, CardHeader } from "@/components/ui/card";
import { requireAdministratorRole } from "@/lib/auth/guards";
import { listAdminUsersData } from "@/lib/data/admin-users";
import { UsersManagement } from "@/components/admin/users-management";

export default async function UserManagementPage() {
  await requireAdministratorRole();
  const { users, roles } = await listAdminUsersData();

  return (
    <Card>
      <CardHeader
        title="User Management"
        subtitle="Administrator-only: create users, assign roles, and manage active status"
      />
      <UsersManagement
        initialUsers={users}
        roles={roles}
      />
    </Card>
  );
}
