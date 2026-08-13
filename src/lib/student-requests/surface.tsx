/**
 * Student surface routing contract.
 *
 * The student request journey is ONE product rendered on two surfaces:
 *   - web portal  → /student/requests/*
 *   - mobile app  → /mobile/student/requests/*
 *
 * Shared screens/components must never hardcode a surface path; they resolve
 * their targets through `useStudentRequestRoutes()` so the mobile app can never
 * escape its container and the web portal keeps its canonical URLs.
 */
import { createContext, useContext, type ReactNode } from "react";

export type StudentSurface = "web" | "mobile";

export const WEB_STUDENT_REQUEST_ROUTES = {
  list: "/student/requests",
  new: "/student/requests/new",
  detail: "/student/requests/$id",
  b1Service: "/student/requests/b1/$service",
  b1View: "/student/requests/b1/view/$requestId",
} as const;

export const MOBILE_STUDENT_REQUEST_ROUTES = {
  list: "/mobile/student/requests",
  new: "/mobile/student/requests/new",
  detail: "/mobile/student/requests/$id",
  b1Service: "/mobile/student/requests/b1/$service",
  b1View: "/mobile/student/requests/b1/view/$requestId",
} as const;

export type StudentRequestRoutes =
  | typeof WEB_STUDENT_REQUEST_ROUTES
  | typeof MOBILE_STUDENT_REQUEST_ROUTES;

const StudentSurfaceContext = createContext<StudentSurface>("web");

export function StudentSurfaceProvider({
  surface,
  children,
}: {
  surface: StudentSurface;
  children: ReactNode;
}) {
  return (
    <StudentSurfaceContext.Provider value={surface}>{children}</StudentSurfaceContext.Provider>
  );
}

export function useStudentSurface(): StudentSurface {
  return useContext(StudentSurfaceContext);
}

export function getStudentRequestRoutes(surface: StudentSurface): StudentRequestRoutes {
  return surface === "mobile" ? MOBILE_STUDENT_REQUEST_ROUTES : WEB_STUDENT_REQUEST_ROUTES;
}

export function useStudentRequestRoutes(): StudentRequestRoutes {
  return getStudentRequestRoutes(useStudentSurface());
}
