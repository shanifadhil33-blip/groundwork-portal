import { expect, it } from 'vitest';
import { detectEmergency, safetyLine } from '../lib/emergency';
it('finds emergencies in several languages',()=>{
 expect(detectEmergency('There is smoke coming from the DB room')).toBe('fire');
 expect(detectEmergency('Gas leak in the kitchen')).toBe('gas');
 expect(detectEmergency('Water everywhere, pipe burst in the basement')).toBe('flood');
 expect(detectEmergency('Socket is sparking')).toBe('electric');
 expect(detectEmergency('رائحة غاز في المطبخ')).toBe('gas');
 expect(detectEmergency('मीटर से चिंगारी निकल रही है')).toBe('electric');
 expect(detectEmergency('ഫ്ലാറ്റിൽ പുക')).toBe('fire');
});
it('does not treat routine equipment as an emergency',()=>{
 for(const t of ['Quarterly fire alarm test','Service the fire extinguishers','Replace smoke detector battery','Fix the floodlight','Tap is dripping','Gas cylinder refill'])expect(detectEmergency(t)).toBeNull();
});
it('gives a safety line first',()=>{expect(safetyLine('smell of gas')).toMatch(/^Safety first/);expect(safetyLine('door handle loose')).toBeNull();});
