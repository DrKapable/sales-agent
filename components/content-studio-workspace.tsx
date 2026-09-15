"use client";

import Link from "next/link";
import { useState } from "react";
import { ContentStudioVisualDrawer } from "@/components/content-studio-visual-drawer";
import { MedMindsContentStudio } from "@/components/medminds-content-studio";
import styles from "./content-studio-workspace.module.css";

export function ContentStudioWorkspace() {
  const [activePostId, setActivePostId] = useState("");
  const [mediaOpen, setMediaOpen] = useState(false);

  return <>
    <nav className={styles.toolbar} aria-label="Marketing workspace">
      <div className={styles.toolbarInner}>
        <Link href="/admin">Dashboard</Link>
        <a href="#content-create">Create</a>
        <button onClick={() => setMediaOpen(true)}>Media</button>
        <a href="#saved-content">Review</a>
        <Link href="/admin/social">Schedule</Link>
      </div>
      <div className={styles.context}>
        <span>{activePostId ? "Working on a saved post" : "New post"}</span>
        <button onClick={() => setMediaOpen(true)}>{activePostId ? "Choose visual" : "Open media library"}</button>
      </div>
    </nav>

    <ContentStudioVisualDrawer
      activePostId={activePostId}
      open={mediaOpen}
      onOpenChange={setMediaOpen}
      showLauncher={false}
    />
    <MedMindsContentStudio
      onActivePostChange={setActivePostId}
      onOpenMediaLibrary={() => setMediaOpen(true)}
    />
  </>;
}
