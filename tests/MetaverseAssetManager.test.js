import { ethers } from 'hardhat';
import { Contract } from 'ethers';
import { expect } from 'chai';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address';

import TokenList from '@balancer-labs/v2-helpers/src/models/tokens/TokenList';

import { bn, fp } from '@balancer-labs/v2-helpers/src/numbers';
import { MAX_UINT256 } from '@balancer-labs/v2-helpers/src/constants';

import { deploy } from '@balancer-labs/v2-helpers/src/contract';
import { WeightedPoolEncoder } from '@balancer-labs/balancer-js';
import { advanceTime } from '@balancer-labs/v2-helpers/src/time';

const tokenInitialBalance = bn(200e18);

const setup = async () => {
    const [, admin, lp, other] = await ethers.getSigners();

    const tokens = await TokenList.create(['DAI', 'MKR'], { sorted: true });

    // Deploy Balancer Vault
    const authorizer = await deploy('v2-vault/Authorizer', { args: [admin.address] });
    const vault = await deploy('v2-vault/Vault', { args: [authorizer.address, tokens.DAI.address, 0, 0] });

    // Deploy mocked reward stuff
    /*
    const lendingPool = await deploy('MockAaveLendingPool', { args: [] });
    const aaveRewardsController = await deploy('MockAaveRewards');
    const stkAave = aaveRewardsController;
    */

    const daiAToken = await deploy('MockAToken', { args: [lendingPool.address, 'aDai', 'aDai', 18] });
    
    
    // await lendingPool.registerAToken(tokens.DAI.address, daiAToken.address);

    // Deploy Asset manager
    const assetManager = await deploy('MetaverseAssetManager', {
        args: [vault.address, tokens.DAI.address],
    });

    // Assign assetManager to the DAI token, and other to the other token
    const assetManagers = [assetManager.address, other.address];

    // Deploy Pool
    const args = [
        vault.address,
        'Test Pool',
        'TEST',
        tokens.addresses,
        [fp(0.5), fp(0.5)],
        assetManagers,
        fp(0.0001),
        0,
        0,
        admin.address,
    ];

    const pool = await deploy('v2-pool-weighted/WeightedPool', {
        args,
    });

    const poolId = await pool.getPoolId();

    await assetManager.initialize(poolId, distributor.address);

    await tokens.mint({ to: lp, amount: tokenInitialBalance });
    await tokens.approve({ to: vault.address, from: [lp] });

    const assets = tokens.addresses;
    
    await vault.connect(lp).joinPool(poolId, lp.address, lp.address, {
        assets: tokens.addresses,
        maxAmountsIn: Array(assets.length).fill(MAX_UINT256),
        fromInternalBalance: false,
        userData: WeightedPoolEncoder.joinInit(Array(assets.length).fill(tokenInitialBalance)),
    });

    return {
        data: {
            poolId,
        },
        contracts: {
            assetManager,
            distributor,
            lendingPool,
            tokens,
            stkAave,
            pool,
            vault,
        },
    };
};

describe('Metaverse Asset manager', function () {
    let vault, assetManager, distributor, pool, stkAave;

    let lp, other;

    before('deploy base contracts', async () => {
        [, , lp, other] = await ethers.getSigners();
    });

    sharedBeforeEach('set up asset manager', async () => {
        const { contracts } = await setup();

        assetManager = contracts.assetManager;
        vault = contracts.vault;
    });

    describe('claimRewards', () => {
        let id;
        const rewardAmount = fp(1);

        beforeEach(async () => {
        });

        it('sends expected amount of stkAave to the rewards contract', async () => {
            await assetManager.claimRewards();
        });

        it('distributes the reward according to the fraction of staked LP tokens', async () => {
            await assetManager.claimRewards();
        });
    });
});