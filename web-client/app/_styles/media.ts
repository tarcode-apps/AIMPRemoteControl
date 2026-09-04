import breakpoints from './breakpoints.module.scss';

const drawerDockedFrom = Number(breakpoints.drawerDockedFrom);
const playerDockedFrom = Number(breakpoints.playerDockedFrom);

export const media = {
    drawerModal: `(max-width: ${drawerDockedFrom - 1}px)`,
    drawerDocked: `(min-width: ${drawerDockedFrom}px)`,
    playerDocked: `(min-width: ${playerDockedFrom}px)`,
    playerSheet: `(max-width: ${playerDockedFrom - 1}px)`,
};
