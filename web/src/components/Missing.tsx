"use client";

import { Ic } from "@/components/Icons";

// What a panel shows when its event or chat isn't there (still loading,
// deleted, or no access), so there's always a way back.
export function Missing({ loading, what, onClose }: { loading: boolean; what: string; onClose: () => void }) {
  return (
    <>
      <div className="chat-head">
        <button className="icon-btn" aria-label="Back" onClick={onClose}>
          <Ic name="back" size={22} width={2.2} />
        </button>
      </div>
      <div className="empty">
        {loading ? (
          <span className="spinner" aria-label="Loading" />
        ) : (
          <>
            This {what} isn’t available any more.
            <br />
            It may have been deleted, or you don’t have access.
          </>
        )}
      </div>
    </>
  );
}
