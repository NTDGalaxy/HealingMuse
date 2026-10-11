export function useRouter() {
  return {
    push(path: string) {
      history.pushState(null, "", path);
      window.dispatchEvent(new Event("healingmuse-fixture-route"));
    },
    back() {
      history.back();
    },
    refresh() {
      window.dispatchEvent(new Event("healingmuse-fixture-route"));
    },
  };
}
