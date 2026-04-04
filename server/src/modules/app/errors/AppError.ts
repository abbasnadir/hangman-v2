// AppError class that will be used to create errors
export class AppError extends Error {
    statusCode: number
    code: string
    constructor (message: string, statusCode = 500, code="INTERNAL_ERROR") {
        super(message)
        this.statusCode = statusCode
        this.code = code

        // Bind stacktrace to the AppError class using class constructor
        Error.captureStackTrace(this, this.constructor)
    }
}

