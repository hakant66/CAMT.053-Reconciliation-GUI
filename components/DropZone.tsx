"use client";
import React, { useState } from "react";

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
  const [isDragOver, setIsDragOver] = useState(false);
  const prevent = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); };
  const onDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    prevent(e);
    setIsDragOver(true);
  };
  const onDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    prevent(e);
    setIsDragOver(false);
  };
  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    prevent(e);
    const f = e.dataTransfer.files?.[0];
    if (f && accept(f)) onDropFile(f);
    setIsDragOver(false);
  };
  return (
    <div
      onDragOver={prevent}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={`${className} ${isDragOver ? "border-emerald-300/80 bg-emerald-900/40" : ""}`}
    >
      {children}
    </div>
  );
}
