export function RoutePending() {
  return (
    <div
      style={{
        display: "flex",
        minHeight: "40vh",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "1rem",
        padding: "4rem 1rem",
      }}
    >
      <div
        style={{
          width: "2.5rem",
          height: "2.5rem",
          border: "2px solid #ff6b2b",
          borderTopColor: "transparent",
          borderRadius: "9999px",
          animation: "spin 1s linear infinite",
        }}
        aria-hidden
      />
      <p style={{ margin: 0, color: "#9499b0" }}>Loading…</p>
    </div>
  );
}
