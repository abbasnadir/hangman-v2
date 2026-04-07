# v1.0

## Setup

- [x] Setup error handling for production and deployment in server
- [x] Setup client
- [x] Database

## Prototype

- [ ] Design API endpoints
- - [x] Create a mock `/me` path
- - - [x] Design the endpoint in openAPI
- - - [x] Test it in postman
- - [x] Test profiles api and profile apis
- - - [ ] create tests
- - [x] Test Relations apis
- - - [x] Fix empty string issues in the api endpoint
- - [ ] Test wordlists and games API endpoints
- - [ ] Document the code using comments for better readability
- - [ ] Finish the design and implementation of other endpoints
- [ ] Design Socket and its endpoints
- - [x] Implement authHandler, rateLimiter, zodSchema parser for socket
- - [ ] Implement zod to parse the routes for both Socket router object and routerObject in routeHandler.ts(s)
- - [ ] Implement error handling for sockets as well
- - - [ ] Replace Error instance with UnauthorizedError for authentication in `socketRouter.ts`
- [x] Set up zod
- [x] Database structure
- [x] List Features
- [ ] Update Readme
- [ ] Create an actual delete endpoint, current delete endpoint is just a deactivation endpoint
- [ ] Do something about deleted/deactivated accounts still being able to browse the app.
- [ ] Fix typescript not able to parse zod objects/detect them properly

## Develop

- [ ] APIs for frontend
- [ ] Database connection
- [ ] Frontend
- [ ] UI Redesign continuation
- [ ] Design for the users with low connectivity
- [ ] Handle unauthorised users

## Optional

- [ ] Use jwks to rotate the supabase signing key automatically.
