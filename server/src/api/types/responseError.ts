// An interface to allow the status variable accessibility
export interface ResponseError extends Error {
  status?: number;
  code?: number;
  statusCode?: number;
}