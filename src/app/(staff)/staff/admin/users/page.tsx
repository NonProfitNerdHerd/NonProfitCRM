import { Card, CardHeader } from "@/components/ui/card";
import { requireStaffPermission } from "@/lib/auth/guards";
import { listAdminUsersData } from "@/lib/data/admin-users";
import { UsersManagement } from "@/components/admin/users-management";

export default async function UserManagementPage() {
  await requireStaffPermission("can_manage_users");
  const { users, roles } = await listAdminUsersData();

  return (
    <Card>
      <CardHeader
        title="User Management"
        subtitle="Create users, assign role templates, and manage active status"
      />
      <UsersManagement
        initialUsers={users}
        roles={roles}
      />
    </Card>
  );
}
