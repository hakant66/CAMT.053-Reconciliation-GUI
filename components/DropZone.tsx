"use client";
import React from "react";

export default function DropZone({
  accept,
  onDropFile,
  children,
  className = "",
}: {
  accept: (file: File) => boolean;
  onDropFile: (file: File) => void;
  children?: React.ReactNode;
  className?: string;
}) {
  const prevent = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); };
  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    prevent(e);
    const f = e.dataTransfer.files?.[0];
    if (f && accept(f)) onDropFile(f);
  };
  return (
    <div onDragOver={prevent} onDragEnter={prevent} onDragLeave={prevent} onDrop={onDrop} className={className}>
      {children}
    </div>
  );
}

