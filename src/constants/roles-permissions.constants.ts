export const ROLES = {
    ADMIN: 'ADMIN',
    SUPER_ADMIN: 'SUPER_ADMIN',
    WORKER: 'WORKER',
};

export const PERMISSIONS = {
    PROJECT: {
        CREATE: 'CREATE_PROJECT',
        EDIT: 'EDIT_PROJECT',
        DELETE: 'DELETE_PROJECT',
        READ: 'READ_PROJECT',
    },
    ORDER: {
        CREATE: 'CREATE_ORDER',
        EDIT: 'EDIT_ORDER',
        DELETE: 'DELETE_ORDER',
        READ: 'READ_ORDER',
    },
    USER_MANAGEMENT: {
        MANAGE_USERS: 'MANAGE_USERS',
        MANAGE_ROLES: 'MANAGE_ROLES',
        MANAGE_PERMISSIONS: 'MANAGE_PERMISSIONS',
    },
    ISSUE: {
        CREATE: 'CREATE_ISSUE',
        EDIT: 'EDIT_ISSUE',
        DELETE: 'DELETE_ISSUE',
        READ: 'READ_ISSUE',
    },
};
