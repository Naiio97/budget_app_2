// Full-page loading spinner — used wherever a route's primary data hasn't
// resolved yet. min-height keeps it well below the page header instead of
// hugging the top edge when the parent collapses to auto height.
export default function PageLoader({ size = 36 }: { size?: number }) {
    return (
        <div
            className="page-container"
            style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                minHeight: "65vh",
            }}
        >
            <div
                style={{
                    width: size,
                    height: size,
                    borderRadius: "50%",
                    border: "3px solid var(--border)",
                    borderTopColor: "var(--accent)",
                    animation: "spin 0.8s linear infinite",
                }}
            />
        </div>
    );
}
