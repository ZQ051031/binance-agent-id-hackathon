// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";

/// @title MockAgentID
/// @notice TEST/LOCAL ONLY. A non-transferable ERC-721 that stands in for the real Agent ID
///         contract on the Hardhat network or BSC testnet. Anyone can mint one token for
///         themselves; it must never be used as a substitute for the real Agent ID on mainnet.
contract MockAgentID is ERC721 {
    uint256 public nextId = 1;

    error NonTransferable();
    error AlreadyHolds();

    constructor() ERC721("Mock Agent ID (test only)", "MOCKAID") {}

    function mint(address to) external returns (uint256 id) {
        if (balanceOf(to) != 0) revert AlreadyHolds();
        id = nextId++;
        _mint(to, id);
    }

    function burn(uint256 id) external {
        require(ownerOf(id) == msg.sender, "not owner");
        _burn(id);
    }

    function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
        address from = _ownerOf(tokenId);
        if (from != address(0) && to != address(0)) revert NonTransferable();
        return super._update(to, tokenId, auth);
    }
}
