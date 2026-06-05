const AppSkeleton = ({ className = '', style }) => (
  <span aria-hidden="true" className={`app-skeleton ${className}`.trim()} style={style} />
);

export default AppSkeleton;
