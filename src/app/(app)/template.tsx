// Har bir sahifa almashganda qayta quriladi → silliq kirish animatsiyasi (CSS; reduced-motion'da o'chadi)
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="page-enter">{children}</div>;
}
