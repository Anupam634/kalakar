import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { Empty, Icon } from "../components/ui";
import type { Post } from "../types";
import { PostTile } from "./Dashboard";

const FILTERS: [string, string][] = [
  ["", "All"], ["ready,failed", "Drafts"], ["needs_approval", "Waiting for you"], ["scheduled", "Scheduled"], ["published", "Posted"],
];

export default function Library() {
  const [q, setQ] = useSearchParams();
  const status = q.get("status") ?? "";
  const [posts, setPosts] = useState<Post[] | null>(null);
  useEffect(() => {
    setPosts(null);
    api.get<{ posts: Post[] }>(`/posts${status ? `?status=${status}` : ""}`).then((r) => setPosts(r.posts));
  }, [status]);
  useEffect(() => {
    if (!posts?.some((p) => p.status === "generating" || p.status === "draft" || p.status === "publishing")) return;
    const t = setTimeout(() => api.get<{ posts: Post[] }>(`/posts${status ? `?status=${status}` : ""}`).then((r) => setPosts(r.posts)), 2500);
    return () => clearTimeout(t);
  }, [posts, status]);

  const count = (s: string) => posts?.filter((p) => p.status === s).length ?? 0;

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-6">
        <h1 className="font-serif text-[56px] leading-none sm:text-[72px]">Library</h1>
        <Link to="/app/create" className="btn-primary px-6 py-3">
          <Icon name="plus" size={16} /> New post
        </Link>
      </div>
      {posts && !status && (
        <div className="mt-6 flex flex-wrap gap-x-12 gap-y-4">
          {[
            [count("published"), "posted"],
            [count("scheduled"), "scheduled"],
            [count("needs_approval"), "waiting for you"],
          ].map(([n, l]) => (
            <div key={l as string}>
              <span className="block font-serif text-[56px] leading-none">{n}</span>
              <span className="text-[13px] text-mute">{l}</span>
            </div>
          ))}
        </div>
      )}
      <div className="no-scrollbar mb-7 mt-8 flex gap-1.5 overflow-x-auto">
        {FILTERS.map(([v, l]) => (
          <button key={l} onClick={() => setQ(v ? { status: v } : {})} className={status === v ? "chip-on" : "chip"}>
            {l}
          </button>
        ))}
      </div>
      {!posts ? (
        <div className="columns-2 gap-4 sm:columns-3 lg:columns-4">{[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className={`shimmer mb-4 rounded-[22px] ${i % 2 ? "aspect-[9/16]" : "aspect-[4/5]"}`} />)}</div>
      ) : !posts.length ? (
        <Empty icon="grid" title="Nothing here yet" text="Posts you create, and the ones Autopilot plans, show up here." action={<Link to="/app/create" className="btn-primary">Create a post</Link>} />
      ) : (
        <div className="columns-2 gap-4 sm:columns-3 lg:columns-4">
          {posts.map((p) => (
            <PostTile key={p.id} p={p} when={p.scheduledAt && p.status !== "published" ? new Date(p.scheduledAt).toLocaleDateString(undefined, { weekday: "short", day: "numeric" }) : undefined} />
          ))}
        </div>
      )}
    </div>
  );
}
