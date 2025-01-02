export const successResponse = (
    data: any,
    message = 'Operation successful',
) => ({
    status: 'success',
    message,
    data,
});

export const errorResponse = (error: any, message = 'Operation failed') => ({
    status: 'error',
    message,
    error,
});
