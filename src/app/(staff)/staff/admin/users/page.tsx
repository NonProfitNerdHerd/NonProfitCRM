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
        initialUsers={users as Array<{
          user_id: string;
          is_active: boolean;
          first_name: string;
          last_name: string;
          display_name: string;
          email: string;
          username: string;
          roles: Array<{ id: string; key: string; name: string }>;
        }>}
        roles={roles}
      />
    </Card>
  );
}
