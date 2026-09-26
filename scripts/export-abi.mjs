// Compiles the contract with Foundry and writes the ABI the server uses at runtime.
// Run after changing contracts/src/StoryVote.sol: npm run contract:abi
import {execFileSync} from 'node:child_process';
import {readFileSync, writeFileSync} from 'node:fs';

execFileSync('forge', ['build', '--root', 'contracts'], {stdio: 'inherit'});
const artifact = JSON.parse(readFileSync('contracts/out/StoryVote.sol/StoryVote.json', 'utf8'));
writeFileSync('src/shared/story-vote-abi.json', `${JSON.stringify(artifact.abi, null, 2)}\n`);
console.log('Wrote src/shared/story-vote-abi.json');
