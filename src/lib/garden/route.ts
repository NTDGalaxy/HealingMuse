import { fallbackScene, routeForPath, type SceneId } from "../routes";

/** The garden behind a path; a path outside the route registry (a 404) shows the fallback. */
export const gardenForPath = (pathname: string): SceneId =>
  routeForPath(pathname)?.scene ?? fallbackScene;
