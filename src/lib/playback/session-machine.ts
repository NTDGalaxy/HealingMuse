// Listening sessions: a signed-in listener who consented to mood check-ins gets one session per
// started recording, so the before and after check-ins can be paired. Every write is guarded by
// the account and consent current when it settles, so a session or prompt never crosses to
// another account or outlives a withdrawn consent.

export type Privacy = Readonly<{ owner: string | null; consent: boolean }>;

export type SessionRequests = {
  /** Opens a session for `trackId` and resolves its id. */
  open(trackId: string, beforeScore: number | undefined, owner: string): Promise<string>;
  /** Ends a session. */
  close(sessionId: string, owner: string | undefined): Promise<void>;
};

export type ListeningSessions = {
  privacy(): Privacy;
  /**
   * Applies the current account and consent. `reset` is true when listening state must be
   * dropped (another account, or consent withdrawn); `accountChanged` when a signed-in account
   * gave way to another or to a guest.
   */
  update(next: Privacy): { reset: boolean; accountChanged: boolean };
  /** Whether a session may be recorded for this user now. */
  mayRecord(userId: string): boolean;
  /**
   * Opens a session for the recording that just started. `isCurrent` tells whether that start is
   * still the latest; a session opened for a superseded start is ended at once.
   */
  open(
    trackId: string,
    beforeScore: number | undefined,
    owner: string,
    isCurrent: () => boolean,
  ): Promise<void>;
  /**
   * Ends the open session, if any. The id is taken synchronously, so a new session never races
   * it. With `feedback`, a successful end asks for the after check-in.
   */
  end(feedback?: boolean): Promise<void>;
  /** Drops the open session without saving it (account change or withdrawn consent). */
  forget(): void;
};

export function createListeningSessions({
  requests,
  initial,
  online,
  onFeedback,
  onSaveFailed,
}: {
  requests: SessionRequests;
  initial: Privacy;
  online: () => boolean;
  /** A session ended for the current consenting account: offer the after check-in. */
  onFeedback: (sessionId: string) => void;
  onSaveFailed: () => void;
}): ListeningSessions {
  let privacy = initial;
  let active: string | null = null;
  return {
    privacy: () => privacy,
    update(next) {
      const previous = privacy;
      privacy = next;
      return {
        reset: previous.owner !== next.owner || (previous.consent && !next.consent),
        accountChanged: !!previous.owner && previous.owner !== next.owner,
      };
    },
    mayRecord: (userId) => privacy.owner === userId && privacy.consent,
    async open(trackId, beforeScore, owner, isCurrent) {
      try {
        const id = await requests.open(trackId, beforeScore, owner);
        if (isCurrent()) active = id;
        else if (privacy.owner === owner) await requests.close(id, owner);
      } catch {
        if (isCurrent()) onSaveFailed();
      }
    },
    async end(feedback = true) {
      const id = active;
      active = null;
      if (!id || !online()) return;
      const owner = privacy.owner;
      try {
        await requests.close(id, owner ?? undefined);
        if (feedback && privacy.owner === owner && privacy.consent) onFeedback(id);
      } catch {
        if (privacy.owner === owner) onSaveFailed();
      }
    },
    forget() {
      active = null;
    },
  };
}
