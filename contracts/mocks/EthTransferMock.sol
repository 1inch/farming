// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

contract EthTransferMock  {
    constructor(address receiver) payable {
        selfdestruct(payable(receiver));
    }
}
