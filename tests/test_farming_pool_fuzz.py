# Wake Development & Testing Framework by Ackee Blockchain (https://getwake.io)
# 
# Run the test using following commands:
# 1) npm install
# 2) pip3 install eth-wake
# 3) wake up pytypes
# 4) wake test
#
# Tested with Wake 4.2.0

from __future__ import annotations
from wake.testing import *
from wake.testing.fuzzing import *
from pytypes.contracts.FarmingPool import FarmingPool
from pytypes.tests.mocks.ERC20Mock import ERC20Mock
from rich import print

ONE = 10**18
DAY = 60*60*24
WEEK = DAY * 7
MONTH = 4 * WEEK
AIRDROP = 100000 * ONE
ERROR_TOLERANCE = 1 # Tokens
LOGGER = True

class Result:

    total_claimed: int 
    staking_token_balance: int
    reward_token_balance: int
    pool_token_total_supply: int

    def __init__(self) -> None:
        self.total_claimed = 0
        self.staking_token_balance = 0
        self.reward_token_balance = 0
        self.pool_token_total_supply = 0

    def print(self):
        log("Staking Token balance: " + amount_str(self.staking_token_balance) +
            "\nPool Token supply    : " + amount_str(self.pool_token_total_supply) +
            "\nReward Token balance : " + amount_str(self.reward_token_balance) +
            "\nTotal claimed        : " + amount_str(self.total_claimed))

class Results:

    total_reward: int
    duration: int

    def __init__(self) -> None:
        self.contract: Result = Result()
        self.model: Result = Result()

    def print(self):
        log("--- Results -------------------------------------------------------------------" +
            "\nTotal Rewards: " + amount_str(self.total_reward) +
            "\nDuration: " + str(int(self.duration/WEEK)) + " weeks" +

            "\n\n- Contract:")
        
        self.contract.print()
        log("\n- Model:")
        self.model.print()

class ERC20Model(Address):

    name: str
    symbol: str
    __balances: dict[Address, int]
    __totalSupply: int
    
    def __init__(self, name: str, symbol: str) -> None:
        super().__init__(str(random_address()))
        self.name = name
        self.symbol = symbol
        self.__balances = dict()
        self.__totalSupply = 0

    def mint(self, to_: Address, amount: int):
        if (self.__balances.get(to_) == None):
            self.__balances[to_] = 0
        self.__balances[to_] += amount
        self.__totalSupply += amount

    def burn(self, from_: Address, amount: int):
        self.__balances[from_] -= amount
        self.__totalSupply -= amount

    def transfer(self, from_: Address, to_: Address, amount: int):
        if (self.__balances.get(from_) == None):
            self.__balances[from_] = 0
        if (self.__balances.get(to_) == None):
            self.__balances[to_] = 0

        self.__balances[from_] -= amount
        self.__balances[to_] += amount

    def balanceOf(self, user: Address):
        if (self.__balances.get(user) == None):
            return 0
        return self.__balances[user]
    
    def totalSupply(self) -> int:
        return self.__totalSupply

    def __str__(self):
        return self._address

class FarmDataModel:

    farm_info: FarmAccountingModel
    user_info: UserAccountingModel
    pool: PoolModel
    
    def __init__(self):
        self.farm_info = FarmAccountingModel()
        self.user_info = UserAccountingModel()
        self.farm_info.data = self
        self.user_info.data = self

    def getSupply(self) -> int:
        return self.pool.totalSupply()
    
    def farmed(self, user: Address, balance: int) -> int:
        return self.user_info.farmed(user, balance, self.user_info.farmedPerToken())

class UserAccountingModel:

    data: FarmDataModel
    checkpoint: int
    farmedPerTokenStored: int = 0
    corrections: dict[Address, int]

    def __init__(self):
        self.checkpoint = 0
        self.farmedPerTokenStored = 0
        self.corrections = dict()

    def updateBalances(self, from_: Address, to_: Address, amount: int, fpt: int):
        
        fromZero = from_ == Address(0)
        toZero = to_ == Address(0)
        
        if(fromZero or toZero):
            self.data.user_info.updateFarmedPerToken(fpt)

        diff = amount * fpt
        if(not fromZero):
            if(self.data.user_info.corrections.get(from_) == None):
                self.data.user_info.corrections[from_] = 0
            self.data.user_info.corrections[from_] -= diff
        
        if(not toZero):
            if(self.data.user_info.corrections.get(to_) == None):
                self.data.user_info.corrections[to_] = 0
            self.data.user_info.corrections[to_] += diff

    def updateFarmedPerToken(self, fpt: int):
        self.data.user_info.checkpoint = timestamp()
        self.data.user_info.farmedPerTokenStored = fpt
    
    def farmedPerToken(self) -> int:
        fpt = self.data.user_info.farmedPerTokenStored
        if (timestamp() != self.checkpoint):
            supply = self.data.getSupply()
            if (supply > 0):
                fpt += self.data.farm_info.farmedSinceCheckpoint(self.checkpoint) / supply
        return fpt
    
    def farmed(self, user: Address, balance: int, fpt: int) -> int:
        if(self.data.user_info.corrections.get(user) == None):
            self.data.user_info.corrections[user] = 0
        return balance * fpt - self.data.user_info.corrections[user]
    
    def eraseFarmed(self, user: Address, balance: int, fpt: int):
        self.data.user_info.corrections[user] = balance * fpt

    def claim(self, user: Address, balance: int) -> int:
        fpt = self.farmedPerToken()
        amount = self.farmed(user, balance, fpt)
        if (amount > 0):
            self.eraseFarmed(user, balance, fpt)
    
        return amount

class FarmAccountingModel:

    data: FarmDataModel
    started: int
    finished: int
    duration: int
    reward: int

    def elapsed(self, checkpoint: int) -> int:
        return min(timestamp(), self.finished) - min(checkpoint, self.finished)
    
    def farmedSinceCheckpoint(self, checkpoint: int) -> int:
        return self.elapsed(checkpoint) * self.reward / self.duration
    
    def startFarming(self, amount: int, period: int):
        self.started = timestamp()
        self.finished = timestamp() + period
        self.duration = period
        self.reward = amount

class PoolModel(ERC20Model):

    staking_token: ERC20Model
    reward_token: ERC20Model
    farm: FarmDataModel
    farm: PoolModel
    claimed: int

    def __init__(self):
        super().__init__("Pool Token", "POOL")
        self.staking_token = ERC20Model("Staking Token", "STK")
        self.reward_token = ERC20Model("Reward Token", "RWD")
        self.farm = FarmDataModel()
        self.farm.pool = self
        self.claimed = 0

    def start(self, amount: int, period: int):
        self.farm.farm_info.startFarming(amount, period)
        self.reward_token.mint(self, amount)

    def deposit(self, user: Address, amount: int):
        self.farm.user_info.updateBalances(Address(0), user, amount, self.farm.user_info.farmedPerToken())
        self.staking_token.transfer(user, self._address, amount)
        self.mint(user, amount)

    def withdraw(self, user: Address, amount: int):
        self.farm.user_info.updateBalances(user, Address(0), amount, self.farm.user_info.farmedPerToken())
        self.staking_token.transfer(self._address, user, amount)
        self.burn(user, amount)

    def claim(self, user: Address) -> int:
        amount = self.farm.user_info.claim(user, self.balanceOf(user))
        self.reward_token.transfer(self._address, user, amount)
        self.claimed += amount
        return amount

    def farmed(self, user: Address) -> int:
        return self.farm.farmed(user, self.balanceOf(user))
    
    def rescue_reward_tokens(self):
        self.reward_token.transfer(self, Address(0), self.reward_token.balanceOf(self))

class FarmingTest(FuzzTest):
    owner: Address
    distributor: Address
    staking_token: ERC20Mock
    reward_token: ERC20Mock
    reward: int
    duration: int
    claimed: int
    pool: FarmingPool
    model: PoolModel
    day = 0
    accounts: dict[Address, bool]

    def pre_sequence(self) -> None:

        log("\n--- Pre Sequence -------------------------------------------------------------------\n")

        self.results = Results()
        self.reward = random_int(1000, 100000) * ONE
        self.duration = random_int(1, 52) * WEEK
        self.claimed = 0
        self.day = 0
        self.accounts = dict()

        # Init model
        self.init_model()

        # Setup accounts
        self.owner = default_chain.accounts[0]
        self.distributor = default_chain.accounts[0]

        # Deploy Tokens
        self.staking_token = ERC20Mock.deploy("Staking", "STK")
        self.reward_token = ERC20Mock.deploy("Reward", "RWD")

        # Deploy FarmingPool
        self.pool = FarmingPool.deploy(self.staking_token.address, self.reward_token.address)
        self.pool.setDistributor(self.distributor)
        
        # Mint, approve reward token and start farming
        self.reward_token.mint(self.distributor, self.reward)
        self.reward_token.approve(self.pool, self.reward, from_=self.distributor)
        self.pool.startFarming(self.reward, self.duration, from_ = self.distributor)

        # Airdops in contracts and model
        for i in range(1, len(default_chain.accounts)):
            self.staking_token.mint(default_chain.accounts[i], AIRDROP)
            self.model.staking_token.mint(default_chain.accounts[i]._address, AIRDROP)

    def init_model(self):
        self.model = PoolModel()
        self.model.start(self.reward, self.duration)

    @flow()
    def flow_farming(self) -> None:
    
        days = random_int(1,7)
        if(self.day != 0):
            prev_timestamp = default_chain.blocks["latest"].timestamp
            default_chain.set_next_block_timestamp(prev_timestamp + (days * DAY))
            default_chain.mine()

        log("\n--- Day " + str(self.day) + " -------------------------------------------------------------------")
        
        if(random_bool):
            user_count = random_int(0, 5)
            claimed = 0

            for i in range(1, user_count):
                user = random_account(lower_bound = 1).address
                        
                if(self.pool.balanceOf(user) == 0):
                    self.deposit(user, random_amount())
                else:
                    claimed += self.claim(user)

                    if(random_bool()):
                        self.deposit(user, random_amount())
                    else:
                        self.withdraw(user, min(random_amount(), self.pool.balanceOf(user)))
        
        self.day += days

    @invariant(period=1)
    def invariant_balances(self) -> None:
        self.fill_results()

        for a in self.accounts:

            # Assert pool token user's balances
            assert(self.pool.balanceOf(a) == self.model.balanceOf(a))
            # Assert staking token users' balances
            assert(self.staking_token.balanceOf(a) == self.model.staking_token.balanceOf(a))
            # Assert reward token users' balances with ERROR_TOLERANCE
            assert(abs(self.reward_token.balanceOf(a) - self.model.reward_token.balanceOf(a)) < ERROR_TOLERANCE * ONE)

        # Assert Pool Token total supply
        assert(self.results.contract.pool_token_total_supply == self.results.model.pool_token_total_supply)
        # Assert Staking Token pool balance == Pool Token total supply
        assert(self.results.model.staking_token_balance == self.results.model.pool_token_total_supply)
        assert(self.results.contract.staking_token_balance == self.results.contract.pool_token_total_supply)
        # Cross validation
        assert(self.results.model.staking_token_balance == self.results.contract.pool_token_total_supply)

        # Assert Reward Token pool's balance
        assert(abs(self.reward_token.balanceOf(self.pool) - self.model.reward_token.balanceOf(self.model)) < ERROR_TOLERANCE * ONE)
        # Assert Reward Token distribution
        assert(self.results.total_reward / ONE == round((self.results.model.reward_token_balance + self.results.model.total_claimed) / ONE))
        assert(self.results.total_reward / ONE == round((self.results.contract.reward_token_balance + self.results.contract.total_claimed) / ONE))


    def post_sequence(self) -> None:
        log("\n--- Post Sequence -------------------------------------------------------------------\n")
        self.results.print()

        #Claim and withdraw the rest (both with 50% probality)
        for a in self.accounts:
            if(self.pool.farmed(a) > 0):
                if(random_bool()):
                    self.claim(a)
                if(self.pool.balanceOf(a) > 0):
                    if(random_bool()):
                        self.withdraw(a, self.pool.balanceOf(a))

        self.fill_results()
        self.results.print()
        log("\n")

    def deposit(self, user: Address, amount: int) -> None:
        self.accounts[user] = True
        contract_balance_before = self.pool.balanceOf(user)
        model_balance_before = self.model.balanceOf(user)

        self.model.deposit(user, amount)

        self.staking_token.approve(self.pool, amount, from_ = user)
        self.pool.deposit(amount, from_ = user)

        log("[green]" + str(user) + " deposits  " + amount_str(self.pool.balanceOf(user) - contract_balance_before) + "[/] [white](" + amount_str(self.model.balanceOf(user) - model_balance_before) +"[/])")

    def withdraw(self, user: Address, amount: int):
        contract_balance_before = self.pool.balanceOf(user)
        model_balance_before = self.model.balanceOf(user)

        self.model.withdraw(user, amount)
        self.pool.withdraw(amount, from_ = user)  

        log("[orange1]" + str(user) + " withdraws " + amount_str(contract_balance_before - self.pool.balanceOf(user)) + "[/] [white](" + amount_str(model_balance_before - self.model.balanceOf(user)) +"[/])")

    def claim(self, user: Address) -> int:
        model_claimed = self.model.claim(user)

        balance_before_claim = self.reward_token.balanceOf(user)
        self.pool.claim(from_ = user)
        balance_after_claim = self.reward_token.balanceOf(user)
        contract_claimed = balance_after_claim - balance_before_claim

        self.claimed += contract_claimed

        log("[yellow]" + str(user) + " claims    " + amount_str(contract_claimed) + "[/] [white](" + amount_str(model_claimed)+"[/])")

        return contract_claimed

    def fill_results(self):
        self.results.total_reward = self.reward
        self.results.duration = self.duration
        self.results.contract.pool_token_total_supply = self.pool.totalSupply()
        self.results.model.pool_token_total_supply = self.model.totalSupply()
        self.results.contract.staking_token_balance = self.staking_token.balanceOf(self.pool)
        self.results.model.staking_token_balance = self.model.staking_token.balanceOf(self.model)
        self.results.contract.reward_token_balance = self.reward_token.balanceOf(self.pool)
        self.results.model.reward_token_balance = self.model.reward_token.balanceOf(self.model)
        self.results.contract.total_claimed = self.claimed
        self.results.model.total_claimed = self.model.claimed


@default_chain.connect()
def test_default():
    FarmingTest().run(sequences_count=1, flows_count=100)

def timestamp() -> int:
    return default_chain.blocks["latest"].timestamp

def random_amount() -> int:
    return (random_int(1, 10) * 100) * ONE

def amount_str(amount: int) -> str:
    return str(amount / ONE)

def log(message: str):
    if(LOGGER):
        print(message)
