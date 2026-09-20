// buddy-designs.js — the robots Buddy can be.
//
// The mascot started as one 16×16 robot that acts out what the assistant is
// doing, pose by pose (the poses live in PixelBuddy.vue, and "classic" still
// picks it). The rest are 32×32: twice the detail at half the pixel, each in
// its own palette, and still — they are here to be chosen between, and
// whichever wins gets the acting.
//
// One character per pixel, the letter naming the colour class the component
// draws it with (px-<letter>): k outline · h shell · s screen · b trim ·
// t warm · a antenna · e eye · i pupil · m mouth · w highlight · l light ·
// o shadow · x blush. Eyes and pupils shut together — see buddy-rig.js.
//
// A design may bring its own `palette`, a colour per letter, and then it is
// drawn in those colours whatever the app's theme — the palette is half the
// point of these. Without one it takes the mascot's usual colours, which
// follow the theme and tint with what the assistant is doing.
//
// Laid out by hand and edited by hand; there is no generator in the repo.

/** A detailed design’s pixel is half a scene unit — see buddy-scene.js. */
export const DETAIL = 0.5;

export const DESIGNS = [
  { id: 'classic', label: 'Classic', about: 'The 16×16 robot that acts out the work', rows: null },
  {
    id: 'amber',
    label: 'Amber',
    about: 'A CRT terminal on legs, phosphor and scanlines',
    // A cabinet this heavy does not sway or bounce about: the face, the jaw
    // and the lamps carry it, and the legs stay put.
    motion: { lean: 0, hop: 0.5 },
    palette: { k: '#ffb000', h: '#3a2a14', b: '#6b4a1d', s: '#120c06', o: '#241708', e: '#ffd27f', i: '#120c06', m: '#ffb000', t: '#ffb000', a: '#ff7b00', w: '#fff1cf', l: '#7ef542' },
    rows: [
      '................................',
      '....kkkkkkkkkkkkkkkkkkkkkkkk....',
      '...khhhhhhhhhhhhhhhhhhhhhhhhk...',
      '...khhkkkkkkkkkkkkkkkkkkkkhhk...',
      '...kthkooooooooooooooooookhtk...',
      '...khhksssssssssssssssssskhhk...',
      '...kthkooooooooooooooooookhtk...',
      '...khhkssseeesssssseeessskhhk...',
      '...khhkoooeieooooooeieoookhhk...',
      '...khhkssseeesssssseeessskhhk...',
      '...khhkooooooooooooooooookhhk...',
      '...khhksssssmssssssmssssskhhk...',
      '...khhkoooooommmmmmooooookhhk...',
      '...khhksssssssssssssssssskhhk...',
      '...khhkooooooooooooooooookhhk...',
      '...khhkkkkkkkkkkkkkkkkkkkkhhk...',
      '...khhhhhhhhhhhhhhhhhhhhhhhhk...',
      '....kkkkkkkkkhhhhhhkkkkkkkkk....',
      '.............khhhhk.............',
      '.............khhhhk.............',
      '.............khhhhk.............',
      '.......kkkkkkbbbbbbkkkkkk.......',
      '......kbllbbbbbbbbbbbbbaak......',
      '......kbbkbkbkbkbkbkbkbkbk......',
      '......kbbbkbkbkbkbkbkbkbbk......',
      '.......kkbbbbbkkkkbbbbbkk.......',
      '.........khhhk....khhhk.........',
      '.........khhhk....khhhk.........',
      '.........khhhk....khhhk.........',
      '.........khhhk....khhhk.........',
      '.......kkbbbbbk..kbbbbbkk.......',
      '.......kkkkkkkk..kkkkkkkk.......',
    ],
  },
  {
    id: 'brass',
    label: 'Brass',
    about: 'Rivets, goggles and a stovepipe hat',
    palette: { k: '#3b2412', h: '#c98f3c', b: '#8c5a2b', s: '#241708', e: '#7fe3ff', i: '#f6e3b8', m: '#3b2412', t: '#e8c46a', a: '#ff9f43', w: '#f6e3b8', l: '#ff9f43', o: '#1b1109' },
    rows: [
      '...........kkkkkkkkkk...........',
      '...........kbbbbbbbbk...........',
      '...........kbbbbbbbbk...........',
      '...........kbbbbbbbbk...........',
      '...........kbbbbbbbbk...........',
      '.......kkkkbbbbbbbbbbkkkk.......',
      '.......kkkbbbhhhhhhbbbkkk.......',
      '..........khhhhhhhhhhk..........',
      '.........kkkkkhhhhkkkkk.........',
      '........tttttttttttttttt........',
      '........ksseesskksseessk........',
      '.......kkseieeskkseieeskkaa.....',
      '.......kkseeeeskkseeeeskkaa.....',
      '.......kksseesskksseesskhkk.....',
      '.......khksssskhhksssskhkbk.....',
      '........khkkkmhhhhmkkkhk.kk.....',
      '........khhhhhmmmmhhhhhk.kk.....',
      '.........khhhhhhhhhhhhkbkbk.....',
      '..........kkkhhhhhhkkk.kbbk.....',
      '.............khhhhk....kbbk.....',
      '..............khhk.....kbbk.....',
      '...........kkkhhhhkkk..kbbk.....',
      '.....kkkkkthhhtttthhht.kbbk.....',
      '.....khhhhhhhthhhhthhhkkkkk.....',
      '.....khhhhhhthhhhhhthhk.........',
      '.....kkkkhhhthhhthhthhk.........',
      '.........khhhthhhhthhhk.........',
      '..........thhhtttthhht..........',
      '...........khhkkkkhhk...........',
      '..........kbbk....kbbk..........',
      '..........kbbk....kbbk..........',
      '..........kkkk....kkkk..........',
    ],
  },
  {
    id: 'neon',
    label: 'Neon',
    about: 'Angular, one glowing visor, magenta edges',
    palette: { k: '#ff2fd0', h: '#2a1250', b: '#3d1a6e', s: '#0d0420', e: '#2ff0ff', i: '#0d0420', m: '#2ff0ff', t: '#ffe14d', a: '#2ff0ff', w: '#ffffff', l: '#2ff0ff', o: '#12042a' },
    rows: [
      '................................',
      '................................',
      '...........kkkkkkkkkk...........',
      '..........khhhhhhhhhhk..........',
      '.........khhhhhhhhhhhhk.........',
      '........khhhhhhhhhhhhhhk........',
      '.......khhhhhhhhhhhhhhhhk.......',
      '......khhhhhhhhhhhhhhhhhhk......',
      '......khhhhhhhhhhhhhhhhhhk......',
      '......khhhhhhhhhhhhhhhhhhk......',
      '......khsssssssssssssssshk......',
      '......khseeeiieeeeiieeeshk......',
      '......khseeeiieeeeiieeeshk......',
      '......khsssssssssssssssshk......',
      '......khhhhhhhhhhhhhhhhhhk......',
      '......kkkkkkkhhhhhhkkkkkkk......',
      '.............khhhhk.............',
      '.............khhhhk.............',
      '........kkkkkbbbbbbkkkkk........',
      '...kkkkkbbbbbbbbbbbbbbbbkkkkk...',
      '...khhhhbbbbbbaaaabbbbbbhhhhk...',
      '...kkkkkbbbbbbaaaabbbbbbkkkkk...',
      '........kbbbbbaaaabbbbbk........',
      '........kkkkkkbbbbkkkkkk........',
      '......tttttttttttttttttttt......',
      '...............kk...............',
      '...........kkkk..kkkk...........',
      '...........kbbk..kbbk...........',
      '...........kbbk..kbbk...........',
      '...........kkkk..kkkk...........',
      '..........kkkkkkkkkkkk..........',
      '..........kkkkkkkkkkkk..........',
    ],
  },
  {
    id: 'slime',
    label: 'Slime',
    about: 'A friendly blob that waves, and no legs at all',
    // No legs to shuffle on: leaning a pixel each way reads as a twitch, so
    // it keeps the bob, the blink and half a hop and leaves the rest.
    motion: { lean: 0, hop: 0.5 },
    palette: { k: '#1d4a22', h: '#8ceb96', b: '#3fbd58', s: '#123a18', e: '#ffffff', i: '#123a18', m: '#1d4a22', t: '#ffe066', a: '#ffe066', w: '#eafff0', l: '#bdf5c8', o: '#0c1f10', x: '#ff9db0' },
    rows: [
      '..............kkkk..............',
      '..............kaak..............',
      '...............kk...............',
      '...............kk...............',
      '.............kkbbkk.............',
      '..........kkkhhhhhhkkk..........',
      '.........khhhhhhhhhhhhk.........',
      '........khhhhwhhhhhhhhhk........',
      '.......khhhhwhhhhhhhhhhhk.......',
      '......khheeeehhhhhheeeehhk......',
      '......kheeeeeehhhheeeeeehk......',
      '.....kheeeeeeeehheeeeeeeehk.....',
      '.....kheeeeieeehheeeeieeehk.....',
      '.....kheeeiieeehheeeiieeehk.....',
      '.....kheeeeeeeehheeeeeeeehk.....',
      '.....khheeeeeehhhheeeeeehhk.....',
      '.....khhheeeehhhhhheeeehhhk.....',
      '......khxxhhhhhhhhhhhhxxhhhkkk..',
      '......khhhhhhhhhhhhhhhhhhhhhhk..',
      '.......khhhhhmhhhhmhhhhhhhkkkk..',
      '..kkkkkhhhhhhhmmmmhhhhhhhk......',
      '..khhhhhhhhhhhhhhhhhhhhhhk......',
      '..kkkkhhhhhhhhhhhhhhhhhhhk......',
      '......khllhhhhhhhhhhhhllhk......',
      '......khllhhhhhllhhhhhllhk......',
      '....kkhhhhhhhhhllhhhhhhhhbkk....',
      '...khhbhhhhhhhhhhhhhhhhhhbhhk...',
      '...khhbhhhhhhhhhhhhhhhhhhbhhk...',
      '....kkbhhhhhhhhhhhhhhhhhhhkk....',
      '......kkkkhhhhhhhhhhhhkkkk......',
      '........oooooooooooooooo........',
      '................................',
    ],
  },
];

/** The design with this id, or the classic robot. */
export function designById(id) {
  return DESIGNS.find(d => d.id === id) || DESIGNS[0];
}
