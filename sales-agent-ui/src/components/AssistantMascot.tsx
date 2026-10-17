export function AssistantMascot({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 64 64"
      role="img"
      aria-label="Sales Agent husky mascot"
      xmlns="http://www.w3.org/2000/svg"
    >
      <image
        href="/husky-mascot.png"
        width="64"
        height="64"
        preserveAspectRatio="xMidYMid meet"
      />
    </svg>
  );
}
