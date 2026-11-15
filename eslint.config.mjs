import next from 'eslint-config-next';
const config = [{ ignores: ['native/**', '.worktrees/**'] }, ...next];
export default config;
