// SPDX-License-Identifier: MIT
pragma solidity ^0.8.7;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract RSKEscrow is ReentrancyGuard {

    using SafeERC20 for IERC20;

    ////////////////////////////////////////////////////////////////////////////////
    // DATA MODEL
    ////////////////////////////////////////////////////////////////////////////////
  
    enum EscrowStatus { NON_EXISTING, LOCKED, RELEASED, REFUNDED }

    struct EscrowOrder {
        string id;
        uint256 timestamp;
        address tokenContractAddress;
        address buyerAddress;
        bytes32 buyerHash;
        address sellerAddress;
        bytes32 sellerHash;
        uint256 amount;
        uint256 fee;
        EscrowStatus status;
        bool adminAction;        
    }

    ////////////////////////////////////////////////////////////////////////////////
    // STORAGE
    ////////////////////////////////////////////////////////////////////////////////

    address private _ownerAddress;
    mapping(address => uint256) private _fees;

    mapping(string => EscrowOrder) private _orders;
    mapping(bytes32 => bool) private _usedHashes;
    mapping(address => bool) private _whitelistedERC20Tokens;
    
    ////////////////////////////////////////////////////////////////////////////////
    // MODIFIERS
    ////////////////////////////////////////////////////////////////////////////////

    modifier onlyOwner() {
        require (msg.sender == _ownerAddress);
        _;
    }

    ////////////////////////////////////////////////////////////////////////////////
    // EVENTS
    ////////////////////////////////////////////////////////////////////////////////
    event OrderLocked(
        string orderId,
        address tokenContractAddress,
        address buyerAddress,
        bytes32 buyerHash,
        address sellerAddress,
        bytes32 sellerHash,
        uint256 amount,
        uint256 fee);

    event OrderReleased(string orderId, address tokenContractAddress, address buyerAddress, uint256 amount, bool adminAction);

    event OrderRefunded(string orderId, address tokenContractAddress, address sellerAddress, uint256 amount, uint256 fee, bool adminAction);


    ////////////////////////////////////////////////////////////////////////////////
    // CONSTRUCTOR
    ////////////////////////////////////////////////////////////////////////////////

    constructor() {
        _ownerAddress = msg.sender;
    }

    ////////////////////////////////////////////////////////////////////////////////
    // EXTERNAL FUNCTIONS
    ////////////////////////////////////////////////////////////////////////////////

    function setWhitelistedERC20Token(address _tokenContractAddress, bool flag) external onlyOwner {
        require (_tokenContractAddress != address(0x0), "Null token address");
        _whitelistedERC20Tokens[_tokenContractAddress] = flag;
    }

    function escrowRBTC(string calldata _orderId, address _buyerAddress, bytes32 _buyerHash, bytes32 _sellerHash, uint256 _amount, uint256 _fee) external nonReentrant payable {
        uint256 totalAmount = _amount + _fee;
        require (msg.value == totalAmount, "Invalid amount");
        _escrow(_orderId, address(0x0), _buyerAddress, _buyerHash, msg.sender, _sellerHash, _amount, _fee);
    }

    function escrowERC20(string calldata _orderId, address _tokenContractAddress, address _buyerAddress, bytes32 _buyerHash, bytes32 _sellerHash, uint256 _amount, uint256 _fee) external nonReentrant {
        require (_tokenContractAddress != address(0x0), "Null token address");
        require (_whitelistedERC20Tokens[_tokenContractAddress], "Not whiteslisted token");
        uint256 totalAmount = _amount + _fee;
        IERC20(_tokenContractAddress).safeTransferFrom(msg.sender, address(this), totalAmount);
        _escrow(_orderId, _tokenContractAddress, _buyerAddress, _buyerHash, msg.sender, _sellerHash, _amount, _fee);
    }

    function releaseToBuyer(string calldata _orderId, bytes32 _buyerCode) external nonReentrant {
        EscrowOrder storage order = _orders[_orderId];
        require (order.buyerHash == sha256(abi.encodePacked(_buyerCode)), "Buyer hash mismatch");
        _release(order, false);
    }

    function refundSeller(string calldata _orderId, bytes32 _sellerCode) external nonReentrant {
        EscrowOrder storage order = _orders[_orderId];
        require (order.sellerHash == sha256(abi.encodePacked(_sellerCode)), "Seller hash mismatch");
        _refund(order, false);        
    }

    function adminReleaseToBuyer(string calldata _orderId) external nonReentrant onlyOwner {
        EscrowOrder storage order = _orders[_orderId];
        _release(order, true);
    }

    function adminRefundSeller(string calldata _orderId) external nonReentrant onlyOwner {
        EscrowOrder storage order = _orders[_orderId];
        _refund(order, true);
    }

    function withdrawFees(address _tokenContractAddress) external onlyOwner nonReentrant {
        uint256 currentFees = _fees[_tokenContractAddress];
        if (currentFees > 0) {
            _fees[_tokenContractAddress] = 0;
            if (_tokenContractAddress == address(0x0)) {
                (bool sent, ) = _ownerAddress.call{value: currentFees}("");
                require (sent, "Send failed.");
            } else {
                IERC20(_tokenContractAddress).safeTransfer(_ownerAddress, currentFees);
            }
        }
    }

    ////////////////////////////////////////////////////////////////////////////////
    // VIEW FUNCTIONS
    ////////////////////////////////////////////////////////////////////////////////

    function orderById(string calldata _orderId) public view returns (EscrowOrder memory) {
        return _orders[_orderId];
    }
    
    function isERC20Whitelisted(address _tokenContractAddress) public view returns (bool) {
        return _whitelistedERC20Tokens[_tokenContractAddress];
    }

    function fees(address _tokenContractAddress) public view returns (uint256) {
        return _fees[_tokenContractAddress];
    }

    ////////////////////////////////////////////////////////////////////////////////
    // INTERNAL
    ////////////////////////////////////////////////////////////////////////////////

    function _escrow(string calldata _orderId, address _tokenContractAddress, address _buyerAddress, bytes32 _buyerHash, address _sellerAddress, bytes32 _sellerHash, uint256 _amount, uint256 _fee) internal {
        require (_buyerAddress != address(0x0), "Invalid buyer");
        require (_amount > 0, "Invalid amount");
        require (_buyerHash.length > 0, "Invalid buyer hash");
        require (_sellerHash.length > 0, "Invalid seller hash");

        EscrowOrder storage order = _orders[_orderId];
        require (order.status == EscrowStatus.NON_EXISTING, "Order already exists");

        order.id = _orderId;
        order.timestamp = block.timestamp;
        order.tokenContractAddress = _tokenContractAddress;
        order.buyerAddress = _buyerAddress;
        order.buyerHash = _buyerHash;
        order.sellerAddress = _sellerAddress;
        order.sellerHash = _sellerHash;
        order.amount = _amount;
        order.fee = _fee;
        order.status = EscrowStatus.LOCKED;
        order.adminAction = false;

        require (_usedHashes[_buyerHash] == false, "Buyer hash is not unique");
        _usedHashes[_buyerHash] = true;

        require (_usedHashes[_sellerHash] == false, "Seller hash is not unique");
        _usedHashes[_sellerHash] = true;

        emit OrderLocked(
            _orderId,
            order.tokenContractAddress,
            order.buyerAddress,
            order.buyerHash,
            order.sellerAddress,
            order.sellerHash,
            order.amount,
            order.fee
        );
    }

    function _release(EscrowOrder storage _order, bool _adminAction) internal {
        // Validate.
        require (_order.status == EscrowStatus.LOCKED, "Invalid escrow status");

        // Update status.
        _order.status = EscrowStatus.RELEASED;
        _order.adminAction = _adminAction;

        // Take fee.
        _fees[_order.tokenContractAddress] += _order.fee;

        // Release RBTC funds to the buyer.
        if (_order.tokenContractAddress == address(0x0)) {
            (bool sent, ) = _order.buyerAddress.call{value: _order.amount}("");
            require (sent, "Send failed.");
        }
        // Release ERC20 funds to the buyer.
         else {
            IERC20(_order.tokenContractAddress).safeTransfer(_order.buyerAddress, _order.amount);
        }

        emit OrderReleased(_order.id, _order.tokenContractAddress, _order.buyerAddress, _order.amount, _adminAction);
    }

    function _refund(EscrowOrder storage _order, bool _adminAction) internal {
        // Validate.
        require (_order.status == EscrowStatus.LOCKED, "Invalid escrow status");

        // Update status.
        _order.status = EscrowStatus.REFUNDED;
        _order.adminAction = _adminAction;

        // We don't take fees on refunds, so we should return the total amount.
        uint256 totalAmount = _order.amount + _order.fee;

        // Refund RBTC.
        if (_order.tokenContractAddress == address(0x0)) {
            (bool sent, ) = _order.sellerAddress.call{value: totalAmount}("");
            require (sent, "Send failed.");
        }
        // Refund ERC20.
         else {
            IERC20(_order.tokenContractAddress).safeTransfer(_order.sellerAddress, totalAmount);
        }

        emit OrderRefunded(_order.id, _order.tokenContractAddress, _order.sellerAddress, _order.amount, _order.fee, _adminAction);
    }
}