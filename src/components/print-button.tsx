"use client";

export const PrintButton = ({ label }: { label: string }) => (
  <button type="button" className="btn btn-primary" onClick={() => window.print()}>{label}</button>
);
