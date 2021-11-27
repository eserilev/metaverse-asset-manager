import { ethers } from 'hardhat';
import { BigNumberish, Contract, ContractTransaction } from 'ethers';
import { expect } from 'chai';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address';
import { Artifacts } from 'hardhat/internal/artifacts';
import { accountToAddress, WeightedPoolEncoder } from '@balancer-labs/balancer-js';
import { BigNumber } from 'ethers';
import Decimal from 'decimal.js';
import { Dictionary } from 'lodash';
import { Artifact } from 'hardhat/types';
import path from 'path';


const SCALING_FACTOR = 1e18;



const fp = (x: BigNumberish | Decimal): BigNumber => bn(toFp(x));

const decimal = (x: BigNumberish | Decimal): Decimal => new Decimal(x.toString());

const toFp = (x: BigNumberish | Decimal): Decimal => decimal(x).mul(SCALING_FACTOR);

const bn = (x: BigNumberish | Decimal): BigNumber => {
    if (BigNumber.isBigNumber(x)) return x;
    const stringified = parseScientific(x.toString());
    const integer = stringified.split('.')[0];
    return BigNumber.from(integer);
};


const maxUint = (e: number): BigNumber => bn(2).pow(e).sub(1);


const MAX_UINT256: BigNumber = maxUint(256);
const ZERO_ADDRESS = "0";

function toAddress(to?: Account): string {
    if (!to) return ZERO_ADDRESS;
    return typeof to === 'string' ? to : to.address;
}

const tokenInitialBalance = bn(200e18);

function parseScientific(num: string): string {
    // If the number is not in scientific notation return it as it is
    if (!/\d+\.?\d*e[+-]*\d+/i.test(num)) return num;

    // Remove the sign
    const numberSign = Math.sign(Number(num));
    num = Math.abs(Number(num)).toString();

    // Parse into coefficient and exponent
    const [coefficient, exponent] = num.toLowerCase().split('e');
    let zeros = Math.abs(Number(exponent));
    const exponentSign = Math.sign(Number(exponent));
    const [integer, decimals] = (coefficient.indexOf('.') != -1 ? coefficient : `${coefficient}.`).split('.');

    if (exponentSign === -1) {
        zeros -= integer.length;
        num =
            zeros < 0
                ? integer.slice(0, zeros) + '.' + integer.slice(zeros) + decimals
                : '0.' + '0'.repeat(zeros) + integer + decimals;
    } else {
        if (decimals) zeros -= decimals.length;
        num =
            zeros < 0
                ? integer + decimals.slice(0, zeros) + '.' + decimals.slice(zeros)
                : integer + decimals + '0'.repeat(zeros);
    }

    return numberSign < 0 ? '-' + num : num;
}


type ContractDeploymentParams = {
    from?: SignerWithAddress;
    args?: Array<unknown>;
    libraries?: Dictionary<string>;
};

async function deploy(
    contract: string,
    { from, args, libraries }: ContractDeploymentParams = {}
): Promise<Contract> {
    if (!args) args = [];
    if (!from) from = (await ethers.getSigners())[0];

    const artifact = await getArtifact(contract);
    if (libraries !== undefined) artifact.bytecode = linkBytecode(artifact, libraries);

    const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, from);
    const instance = await factory.deploy(...args);

    return deployedAt(contract, instance.address);
}

// From https://github.com/nomiclabs/hardhat/issues/611#issuecomment-638891597, temporary workaround until
// https://github.com/nomiclabs/hardhat/issues/1716 is addressed.
function linkBytecode(artifact: Artifact, libraries: Dictionary<string>): string {
    let bytecode = artifact.bytecode;

    for (const [, fileReferences] of Object.entries(artifact.linkReferences)) {
        for (const [libName, fixups] of Object.entries(fileReferences)) {
            const addr = libraries[libName];
            if (addr === undefined) {
                continue;
            }

            for (const fixup of fixups) {
                bytecode =
                    bytecode.substr(0, 2 + fixup.start * 2) +
                    addr.substr(2) +
                    bytecode.substr(2 + (fixup.start + fixup.length) * 2);
            }
        }
    }

    return bytecode;
}

// Creates a contract object for a contract deployed at a known address. The `contract` argument follows the same rules
// as in `deploy`.
export async function deployedAt(contract: string, address: string): Promise<Contract> {
    const artifact = await getArtifact(contract);
    return ethers.getContractAt(artifact.abi, address);
}

export async function getArtifact(contract: string): Promise<Artifact> {
    let artifactsPath: string;
    console.log(contract)
    if (!contract.includes('/')) {
        artifactsPath = path.resolve('./artifacts');
    } else {
        const packageName = `@balancer-labs/${contract.split('/')[0]}`;
        const packagePath = path.dirname(require.resolve(`${packageName}/package.json`));
        artifactsPath = `${packagePath}/artifacts`;
    }

    const artifacts = new Artifacts(artifactsPath);
    return artifacts.readArtifact(contract.split('/').slice(-1)[0]);
}

/****
 ****
****/
/****
 ****
****/

/*
 * Tokens
*/


export class Token {
    public name: string;
    public symbol: string;
    public decimals: number;
    public instance: Contract;

    static async create(params: RawTokenDeployment): Promise<Token> {
        return TokensDeployer.deployToken(params);
    }

    static async deployedAt(address: string): Promise<Token> {
        const instance = await deployedAt('TestToken', address);
        const [name, symbol, decimals] = await Promise.all([instance.name(), instance.symbol(), instance.decimals()]);
        if (symbol === 'WETH') {
            return new Token(name, symbol, decimals, await deployedAt('TestWETH', address));
        }
        return new Token(name, symbol, decimals, instance);
    }

    constructor(name: string, symbol: string, decimals: number, instance: Contract) {
        this.name = name;
        this.symbol = symbol;
        this.decimals = decimals;
        this.instance = instance;
    }

    get address(): string {
        return this.instance.address;
    }

    async balanceOf(account: Account): Promise<BigNumber> {
        return this.instance.balanceOf(toAddress(account));
    }

    async mint(to: Account, amount?: BigNumberish, { from }: TxParams = {}): Promise<void> {
        const token = from ? this.instance.connect(from) : this.instance;

        if (this.symbol === 'WETH') {
            await token.deposit({ value: amount });
            await token.transfer(toAddress(to), amount);
        } else {
            await token.mint(toAddress(to), amount ?? MAX_UINT256);
        }
    }

    async transfer(to: Account, amount: BigNumberish, { from }: TxParams = {}): Promise<ContractTransaction> {
        const token = from ? this.instance.connect(from) : this.instance;
        return token.transfer(toAddress(to), amount);
    }

    async approve(to: Account, amount?: BigNumberish, { from }: TxParams = {}): Promise<ContractTransaction> {
        const token = from ? this.instance.connect(from) : this.instance;
        return token.approve(toAddress(to), amount ?? MAX_UINT256);
    }

    async burn(amount: BigNumberish, { from }: TxParams = {}): Promise<ContractTransaction> {
        const token = from ? this.instance.connect(from) : this.instance;
        return token.burn(amount);
    }

    compare(anotherToken: Token): number {
        return this.address.toLowerCase() > anotherToken.address.toLowerCase() ? 1 : -1;
    }
}

export type NAry<T> = T | Array<T>;

export type Account = string | SignerWithAddress | Contract | { address: string };

export type TxParams = {
    from?: SignerWithAddress;
};

export type RawTokensDeployment = number | NAry<RawTokenDeployment>;

export type TokensDeploymentOptions = {
    sorted?: boolean;
    varyDecimals?: boolean;
    from?: SignerWithAddress;
};

export type RawTokenDeployment =
    | string
    | {
        name?: string;
        symbol?: string;
        decimals?: number;
        from?: SignerWithAddress;
    };

export type TokenDeployment = {
    name: string;
    symbol: string;
    decimals: number;
    from?: SignerWithAddress;
};

export type RawTokenMint = NAry<{
    to: NAry<Account>;
    from?: SignerWithAddress;
    amount?: BigNumberish;
}>;

export type TokenMint = {
    to: Account;
    from?: SignerWithAddress;
    amount?: BigNumberish;
};

export type RawTokenApproval = NAry<{
    to: NAry<Account>;
    from?: NAry<SignerWithAddress>;
    amount?: BigNumberish;
}>;

export type TokenApproval = {
    to: Account;
    from?: SignerWithAddress;
    amount?: BigNumberish;
};

export function computeDecimalsFromIndex(i: number): number {
    // Produces repeating series (18..0)
    return 18 - (i % 19);
}

/***
  * Converts a raw token deployment into a consistent deployment request
  * @param params Could be a single string denoting the token symbol or optional token attributes (decimals, symbol, name)
  */
function toTokenDeployment(params: RawTokenDeployment): TokenDeployment {
    if (typeof params === 'string') params = { symbol: params };
    const { name, symbol, decimals, from } = params;
    return {
        from,
        name: name ?? `Token`,
        symbol: symbol ?? `TKN`,
        decimals: decimals ?? 18,
    };
}

function toTokenDeployments(params: RawTokensDeployment, from?: SignerWithAddress, varyDecimals = false): TokenDeployment[] {
    params = typeof params === 'number' ? Array(params).fill({}) : params;
    if (!Array.isArray(params)) params = [params];

    return params.map((param, i) => {
        if (typeof param === 'string') param = { symbol: param, from };
        const args = Object.assign(
            {},
            { symbol: `TK${i}`, name: `Token ${i}`, decimals: varyDecimals ? computeDecimalsFromIndex(i) : 18, from },
            param
        );
        return toTokenDeployment(args);
    });
}

/***
  * Converts a raw token approval param into a consistent approval list
  */
function toTokenApprovals(params: RawTokenApproval): TokenApproval[] {
    if (Array.isArray(params)) return params.flatMap(toTokenApprovals);

    const { to: recipients, amount, from } = params;
    const to = Array.isArray(recipients) ? recipients : [recipients];

    return to.flatMap((to) =>
        Array.isArray(from) ? from.map((from) => ({ to, amount, from })) : [{ to, amount, from }]
    );
}


/***
 * Converts a raw token mint param into a consistent minting list
 */
function toTokenMints(params: RawTokenMint): TokenMint[] {
    if (Array.isArray(params)) return params.flatMap(toTokenMints);

    const { to, amount, from } = params;

    if (!Array.isArray(to)) {
        if (Array.isArray(from)) throw Error('Inconsistent mint sender length');
        return [{ to, amount, from }];
    }

    if (Array.isArray(from) && to.length !== from.length) throw Error('Inconsistent mint sender length');
    return to.map((to, i) => ({ to, amount, from: Array.isArray(from) ? from[i] : from }));
}


class TokensDeployer {
    public static async deploy(
        params: RawTokensDeployment,
        { sorted, varyDecimals, from }: TokensDeploymentOptions = {}
    ): Promise<TokenList> {
        const defaultSender = from || (await ethers.getSigners())[0];
        const trimmedParams = sorted ? this._trimParamsForSortedDeploy(params) : params;
        const deployments: TokenDeployment[] = toTokenDeployments(
            trimmedParams,
            defaultSender,
            varyDecimals
        );
        const tokens = await Promise.all(deployments.map(this.deployToken));
        const sortedTokens = sorted ? this._sortTokensDeployment(tokens, params) : tokens;
        return new TokenList(sortedTokens);
    }

    static async deployToken(params: RawTokenDeployment): Promise<Token> {
        const { symbol, name, decimals, from } = toTokenDeployment(params);
        const sender = from || (await ethers.getSigners())[0];
        let instance;
        if (symbol !== 'WETH') {
            instance = await deploy('TestToken', {
                from: sender,
                args: [sender.address, 'Token', 'TKN', decimals],
            });
        } else {
            instance = await deploy('TestWETH', {
                from: sender,
                args: [sender.address],
            });
        }

        return new Token(name, symbol, decimals, instance);
    }

    private static _sortTokensDeployment(tokens: Token[], params: RawTokensDeployment): Token[] {
        const sortedTokens = [...tokens].sort((a, b) => a.compare(b));
        return toTokenDeployments(params).map((param, i) => {
            const token = sortedTokens[i];
            token.name = param.name;
            token.symbol = param.symbol;
            return token;
        });
    }

    private static _trimParamsForSortedDeploy(params: RawTokensDeployment): number {
        if (typeof params === 'number') return params;
        return Array.isArray(params) ? params.length : 1;
    }
}


export class TokenList {
    tokens: Token[] = [];

    constructor(tokens: Token[] = []) {
        this.tokens = tokens;
    }

    static async create(params: RawTokensDeployment, options: TokensDeploymentOptions = {}): Promise<TokenList> {
        return TokensDeployer.deploy(params, options);
    }

    get length(): number {
        return this.tokens.length;
    }

    get addresses(): string[] {
        return this.tokens.map((token) => token.address);
    }


    get DAI(): Token {
        return this.findBySymbol('DAI');
    }

    findBySymbol(symbol: string): Token {
        const token = this.tokens.find((token) => token.symbol.toLowerCase() === symbol.toLowerCase());
        if (!token) throw Error(`Could not find token with symbol ${symbol}`);
        return token;
    }

    async mint(rawParams: RawTokenMint): Promise<void> {
        const params: TokenMint[] = toTokenMints(rawParams);
        await Promise.all(
            params.flatMap(({ to, amount, from }) => this.tokens.map((token) => token.mint(to, amount, { from })))
        );
    }

    async approve(rawParams: RawTokenApproval): Promise<void> {
        const params: TokenApproval[] = toTokenApprovals(rawParams);
        await Promise.all(
            params.flatMap(({ to, amount, from }) => this.tokens.map((token) => token.approve(to, amount, { from })))
        );
    }
}


/****
 ****
****/
/****
 ****
****/


const setup = async () => {
    const [, admin, lp, other] = await ethers.getSigners();

    const tokens = await TokenList.create(['DAI', 'MKR'], { sorted: true });

    console.log(tokens);

    // Deploy Balancer Vault
    const authorizer = await deploy('Authorizer', { args: [admin.address] });
    const vault = await deploy('Vault', { args: [authorizer.address, tokens.DAI.address, 0, 0] });


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


    const pool = await deploy('WeightedPool', {
        args,
    });

    const poolId = await pool.getPoolId();

    await assetManager.initialize(poolId, assetManager.address);

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
            tokens,
            pool,
            vault,
        },
    };
};

describe('Metaverse Asset manager', function () {
    let vault: Contract, assetManager: Contract, distributor: Contract, pool: Contract, stkAave: Contract;

    let lp: SignerWithAddress, other: SignerWithAddress;

    before('deploy base contracts', async () => {
        [, , lp, other] = await ethers.getSigners();
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