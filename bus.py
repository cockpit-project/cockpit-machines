# systemd_ctypes
#
# Copyright (C) 2022 Allison Karlitskaya <allison.karlitskaya@redhat.com>
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU General Public License for more details.
#
# You should have received a copy of the GNU General Public License
# along with this program.  If not, see <http://www.gnu.org/licenses/>.

import asyncio
import enum
import logging
import sys
import typing
from typing import Any, Callable, Dict, Optional, Sequence, Tuple, Union

from . import bustypes, introspection, libsystemd
from .librarywrapper import WeakReference, byref

logger = logging.getLogger(__name__)

# Set of active async tasks to prevent garbage collection before completion
_active_tasks: 'set[asyncio.Task]' = set()


class BusError(Exception):
    """An exception corresponding to a D-Bus error message

    This exception is raised by the method call methods.  You can also raise it
    from your own method handlers.  It can also be passed directly to functions
    such as Message.reply_method_error().

    :name: the 'code' of the error, like org.freedesktop.DBus.Error.UnknownMethod
    :message: a human-readable description of the error
    """
    def __init__(self, name: str, message: str):
        super().__init__(f'{name}: {message}')
        self.name = name
        self.message = message


class BusMessage(libsystemd.sd_bus_message):
    """A message, received from or to be sent over D-Bus

    This is the low-level interface to receiving and sending individual
    messages over D-Bus.  You won't normally need to use it.

    A message is associated with a particular bus.  You can create messages for
    a bus with Bus.message_new_method_call() or Bus.message_new_signal().  You
    can create replies to method calls with Message.new_method_return() or
    Message.new_method_error().  You can append arguments with Message.append()
    and send the message with Message.send().
    """
    def get_bus(self) -> 'Bus':
        """Get the bus that a message is associated with.

        This is the bus that a message came from or will be sent on.  Every
        message has an associated bus, and it cannot be changed.

        :returns: the Bus
        """
        return Bus.ref(self._get_bus())

    def get_error(self) -> Optional[BusError]:
        """Get the BusError from a message.

        :returns: a BusError for an error message, or None for a non-error message
        """
        error = self._get_error()
        if error:
            return BusError(*error.contents.get())
        else:
            return None

    def new_method_return(self, signature: str = '', *args: Any) -> 'BusMessage':
        """Create a new (successful) return message as a reply to this message.

        This only makes sense when performed on a method call message.

        :signature: The signature of the result, as a string.
        :args: The values to send, conforming to the signature string.

        :returns: the reply message
        """
        reply = BusMessage()
        self._new_method_return(byref(reply))
        reply.append(signature, *args)
        return reply

    def new_method_error(self, error: Union[BusError, OSError]) -> 'BusMessage':
        """Create a new error message as a reply to this message.

        This only makes sense when performed on a method call message.

        :error: BusError or OSError of the error to send

        :returns: the reply message
        """
        reply = BusMessage()
        if isinstance(error, BusError):
            self._new_method_errorf(byref(reply), error.name, "%s", error.message)
        else:
            assert isinstance(error, OSError)
            assert isinstance(error.errno, int), 'OSError must have an integer errno'
            self._new_method_errnof(byref(reply), error.errno, "%s", str(error))
        return reply

    def append_arg(self, typestring: str, arg: Any) -> None:
        """Append a single argument to the message.

        :typestring: a single typestring, such as 's', or 'a{sv}'
        :arg: the argument to append, matching the typestring
        """
        type_, = bustypes.from_signature(typestring)
        type_.writer(self, arg)

    def append(self, signature: str, *args: Any) -> None:
        """Append zero or more arguments to the message.

        :signature: concatenated typestrings, such 'a{sv}' (one arg), or 'ss' (two args)
        :args: one argument for each type string in the signature
        """
        types = bustypes.from_signature(signature)
        assert len(types) == len(args), f'call args {args} have different length than signature {signature}'
        for type_, arg in zip(types, args):
            type_.writer(self, arg)

    def get_body(self) -> Tuple[object, ...]:
        """Gets the body of a message.

        Possible return values are (), ('single',), or ('x', 'y').  If you
        check the signature of the message using Message.has_signature() then
        you can use tuple unpacking.

           single, = message.get_body()

           x, y = other_message.get_body()

        :returns: an n-tuple containing one value per argument in the message
        """
        self.rewind(True)
        types = bustypes.from_signature(self.get_signature(True))
        return tuple(type_.reader(self) for type_ in types)

    def send(self) -> bool:  # Literal[True]
        """Sends a message on the bus that it was created for.

        :returns: True
        """
        self.get_bus().send(self, None)
        return True

    def reply_method_error(self, error: Union[BusError, OSError]) -> bool:  # Literal[True]
        """Sends an error as a reply to a method call message.

        :error: A BusError or OSError

        :returns: True
        """
        return self.new_method_error(error).send()

    def reply_method_return(self, signature: str = '', *args: Any) -> bool:  # Literal[True]
        """Sends a return value as a reply to a method call message.

        :signature: The signature of the result, as a string.
        :args: The values to send, conforming to the signature string.

        :returns: True
        """
        return self.new_method_return(signature, *args).send()

    def _coroutine_task_complete(self, out_type: bustypes.MessageType, task: asyncio.Task) -> None:
        try:
            self.reply_method_function_return_value(out_type, task.result())
        except (BusError, OSError) as exc:
            self.reply_method_error(exc)

    def reply_method_function_return_value(self,
                                           out_type: bustypes.MessageType,
                                           return_value: Any) -> bool:  # Literal[True]:
        """Sends the result of a function call as a reply to a method call message.

        This call does a bit of magic: it adapts from the usual Python return
        value conventions (where the return value is ``None``, a single value,
        or a tuple) to the normal D-Bus return value conventions (where the
        result is always a tuple).

        Additionally, if the value is found to be a coroutine, a task is
        created to run the coroutine to completion and return the result
        (including exception handling).

        :out_types: The types of the return values, as an iterable.
        :return_value: The return value of a Python function call.

        :returns: True
        """
        if asyncio.coroutines.iscoroutine(return_value):
            task = asyncio.create_task(return_value)

            # Keep task alive to prevent garbage collection
            _active_tasks.add(task)

            def done_callback(task: asyncio.Task) -> None:
                _active_tasks.discard(task)
                self._coroutine_task_complete(out_type, task)

            task.add_done_callback(done_callback)
            return True

        reply = self.new_method_return()
        # In the general case, a function returns an n-tuple, but...
        if len(out_type) == 0:
            # Functions with no return value return None.
            assert return_value is None
        elif len(out_type) == 1:
            # Functions with a single return value return that value.
            out_type.write(reply, return_value)
        else:
            # (general case) n return values are handled as an n-tuple.
            assert len(out_type) == len(return_value)
            out_type.write(reply, *return_value)
        return reply.send()


class Slot(libsystemd.sd_bus_slot):
    def __init__(self, callback: Callable[[BusMessage], bool]):
        def handler(message: WeakReference, _data: object, _err: object) -> int:
            return 1 if callback(BusMessage.ref(message)) else 0
        self.trampoline = libsystemd.sd_bus_message_handler_t(handler)


if typing.TYPE_CHECKING:
    FutureMessage = asyncio.Future[BusMessage]
else:
    # Python 3.6 can't subscript asyncio.Future
    FutureMessage = asyncio.Future


class PendingCall(Slot):
    future: FutureMessage

    def __init__(self) -> None:
        future = asyncio.get_running_loop().create_future()

        def done(message: BusMessage) -> bool:
            error = message.get_error()
            if future.cancelled():
                return True
            if error is not None:
                future.set_exception(error)
            else:
                future.set_result(message)
            return True

        super().__init__(done)
        self.future = future


class Bus(libsystemd.sd_bus):
    _default_system_instance = None
    _default_user_instance = None

    class NameFlags(enum.IntFlag):
        DEFAULT = 0
        REPLACE_EXISTING = 1 << 0
        ALLOW_REPLACEMENT = 1 << 1
        QUEUE = 1 << 2

    @staticmethod
    def new(
            fd: Optional[int] = None,
            address: Optional[str] = None,
            bus_client: bool = False,
            server: bool = False,
            start: bool = True,
            attach_event: bool = True
    ) -> 'Bus':
        bus = Bus()
        Bus._new(byref(bus))
        if address is not None:
            bus.set_address(address)
        if fd is not None:
            bus.set_fd(fd, fd)
        if bus_client:
            bus.set_bus_client(True)
        if server:
            bus.set_server(True, libsystemd.sd_id128())
        if address is not None or fd is not None:
            if start:
                bus.start()
            if attach_event:
                bus.attach_event(None, 0)
        return bus

    @staticmethod
    def default_system(attach_event: bool = True) -> 'Bus':
        if Bus._default_system_instance is None:
            bus = Bus()
            Bus._default_system(byref(bus))
            if attach_event:
                bus.attach_event(None, 0)
            Bus._default_system_instance = bus
        return Bus._default_system_instance

    @staticmethod
    def default_user(attach_event: bool = True) -> 'Bus':
        if Bus._default_user_instance is None:
            sys.stderr.write("GET USER BUS\n")
            bus = Bus()
            Bus._default_user(byref(bus))
            if attach_event:
                bus.attach_event(None, 0)
            Bus._default_user_instance = bus
            sys.stderr.write("GOT USER BUS\n")
        return Bus._default_user_instance

    def message_new_method_call(
            self,
            destination: Optional[str],
            path: str,
            interface: str,
            member: str,
            types: str = '',
            *args: object
    ) -> BusMessage:
        message = BusMessage()
        self._message_new_method_call(byref(message), destination, path, interface, member)
        message.append(types, *args)
        return message

    def message_new_signal(
        self, path: str, interface: str, member: str, types: str = '', *args: object
    ) -> BusMessage:
        message = BusMessage()
        self._message_new_signal(byref(message), path, interface, member)
        message.append(types, *args)
        return message

    def call(self, message: BusMessage, timeout: Optional[int] = None) -> BusMessage:
        reply = BusMessage()
        error = libsystemd.sd_bus_error()
        try:
            self._call(message, timeout or 0, byref(error), byref(reply))
            return reply
        except OSError as exc:
            raise BusError(*error.get()) from exc

    def call_method(
            self,
            destination: str,
            path: str,
            interface: str,
            member: str,
            types: str = '',
            *args: object,
            timeout: Optional[int] = None
    ) -> Tuple[object, ...]:
        logger.debug('Doing sync method call %s %s %s %s %s %s',
                     destination, path, interface, member, types, args)
        message = self.message_new_method_call(destination, path, interface, member, types, *args)
        message = self.call(message, timeout)
        return message.get_body()

    async def call_async(
            self,
            message: BusMessage,
            timeout: Optional[int] = None
    ) -> BusMessage:
        pending = PendingCall()
        self._call_async(byref(pending), message, pending.trampoline, pending.userdata, timeout or 0)
        return await pending.future

    async def call_method_async(
        self,
        destination: Optional[str],
        path: str,
        interface: str,
        member: str,
        types: str = '',
        *args: object,
        timeout: Optional[int] = None
    ) -> Tuple[object, ...]:
        logger.debug('Doing async method call %s %s %s %s %s %s',
                     destination, path, interface, member, types, args)
        message = self.message_new_method_call(destination, path, interface, member, types, *args)
        message = await self.call_async(message, timeout)
        return message.get_body()

    def add_match(self, rule: str, handler: Callable[[BusMessage], bool]) -> Slot:
        slot = Slot(handler)
        self._add_match(byref(slot), rule, slot.trampoline, slot.userdata)
        return slot

    def add_object(self, path: str, obj: 'BaseObject') -> Slot:
        slot = Slot(obj.message_received)
        self._add_object(byref(slot), path, slot.trampoline, slot.userdata)
        obj.registered_on_bus(self, path)
        return slot


class BaseObject:
    """Base object type for exporting objects on the bus

    This is the lowest-level class that can be passed to Bus.add_object().

    If you want to directly subclass this, you'll need to implement
    `message_received()`.

    Subclassing from `bus.Object` is probably a better choice.
    """
    _dbus_bus: Optional[Bus] = None
    _dbus_path: Optional[str] = None

    def registered_on_bus(self, bus: Bus, path: str) -> None:
        """Report that an instance was exported on a given bus and path.

        This is used so that the instance knows where to send signals.
        Bus.add_object() calls this: you probably shouldn't call this on your
        own.
        """
        self._dbus_bus = bus
        self._dbus_path = path

        self.registered()

    def registered(self) -> None:
        """Called after an object has been registered on the bus

        This is the correct method to implement to do some initial work that
        needs to be done after registration.  The default implementation does
        nothing.
        """
        pass

    def emit_signal(
            self, interface: str, name: str, signature: str, *args: Any
    ) -> bool:
        """Emit a D-Bus signal on this object

        The object must have been exported on the bus with Bus.add_object().

        :interface: the interface of the signal
        :name: the 'member' name of the signal to emit
        :signature: the type signature, as a string
        :args: the arguments, according to the signature
        :returns: True
        """
        assert self._dbus_bus is not None
        assert self._dbus_path is not None
        return self._dbus_bus.message_new_signal(self._dbus_path, interface, name, signature, *args).send()

    def message_received(self, message: BusMessage) -> bool:
        """Called when a message is received for this object

        This is the lowest level interface to the BaseObject.  You need to
        handle method calls, properties, and introspection.

        You are expected to handle the message and return True.  Normally this
        means that you send a reply.  If you don't want to handle the message,
        return False and other handlers will have a chance to run.  If no
        handler handles the message, systemd will generate a suitable error
        message and send that, instead.

        :message: the message that was received
        :returns: True if the message was handled
        """
        raise NotImplementedError


class Interface:
    """The high-level base class for defining D-Bus interfaces

    This class provides high-level APIs for defining methods, properties, and
    signals, as well as implementing introspection.

    On its own, this class doesn't provide a mechanism for exporting anything
    on the bus.  The Object class does that, and you'll generally want to
    subclass from it, as it contains several built-in standard interfaces
    (introspection, properties, etc.).

    The name of your class will be interpreted as a D-Bus interface name.
    Underscores are converted to dots.  No case conversion is performed.  If
    the interface name can't be represented using this scheme, or if you'd like
    to name your class differently, you can provide an interface= kwarg to the
    class definition.

        class com_example_Interface(bus.Object):
            pass

        class MyInterface(bus.Object, interface='org.cockpit_project.Interface'):
            pass

    The methods, properties, and signals which are visible from D-Bus are
    defined using helper classes with the corresponding names (Method,
    Property, Signal).  You should use normal Python snake_case conventions for
    the member names: they will automatically be converted to CamelCase by
    splitting on underscore and converting the first letter of each resulting
    word to uppercase.  For example, `method_name` becomes `MethodName`.

    Each Method, Property, or Signal constructor takes an optional name= kwargs
    to override the automatic name conversion convention above.

    An example class might look like:

        class com_example_MyObject(bus.Object):
            created = bus.Interface.Signal('s', 'i')
            renames = bus.Interface.Property('u', value=0)
            name = bus.Interface.Property('s', 'undefined')

            @bus.Interface.Method(out_types=(), in_types='s')
            def rename(self, name):
                self.renames += 1
                self.name = name

            def registered(self):
                self.created('Hello', 42)

    See the documentation for the Method, Property, and Signal classes for
    more information and examples.
    """

    # Class variables
    _dbus_interfaces: Dict[str, Dict[str, Dict[str, Any]]]
    _dbus_members: Optional[Tuple[str, Dict[str, Dict[str, Any]]]]

    # Instance variables: stored in Python form
    _dbus_property_values: Optional[Dict[str, Any]] = None

    @classmethod
    def __init_subclass__(cls, interface: Optional[str] = None) -> None:
        if interface is None:
            assert '__' not in cls.__name__, 'Class name cannot contain sequential underscores'
            interface = cls.__name__.replace('_', '.')

        # This is the information for this subclass directly
        members: Dict[str, Dict[str, Interface._Member]] = {'methods': {}, 'properties': {}, 'signals': {}}
        for name, member in cls.__dict__.items():
            if isinstance(member, Interface._Member):
                member.setup(interface, name, members)

        # We only store the information if something was actually defined
        if sum(len(category) for category in members.values()) > 0:
            cls._dbus_members = (interface, members)

        # This is the information for this subclass, with all its ancestors
        cls._dbus_interfaces = dict(ancestor.__dict__['_dbus_members']
                                    for ancestor in cls.mro()
                                    if '_dbus_members' in ancestor.__dict__)

    @classmethod
    def _find_interface(cls, interface: str) -> Dict[str, Dict[str, '_Member']]:
        try:
            return cls._dbus_interfaces[interface]
        except KeyError as exc:
            raise Object.Method.Unhandled from exc

    @classmethod
    def _find_category(cls, interface: str, category: str) -> Dict[str, '_Member']:
        return cls._find_interface(interface)[category]

    @classmethod
    def _find_member(cls, interface: str, category: str, member: str) -> '_Member':
        members = cls._find_category(interface, category)
        try:
            return members[member]
        except KeyError as exc:
            raise Object.Method.Unhandled from exc

    class _Member:
        _category: str  # filled in from subclasses

        _python_name: Optional[str] = None
        _name: Optional[str] = None
        _interface: Optional[str] = None
        _description: Optional[Dict[str, Any]]

        def __init__(self, name: Optional[str] = None) -> None:
            self._python_name = None
            self._interface = None
            self._name = name

        def setup(self, interface: str, name: str, members: Dict[str, Dict[str, 'Interface._Member']]) -> None:
            self._python_name = name  # for error messages
            if self._name is None:
                self._name = ''.join(word.title() for word in name.split('_'))
            self._interface = interface
            self._description = self._describe()
            members[self._category][self._name] = self

        def _describe(self) -> Dict[str, Any]:
            raise NotImplementedError

        def __getitem__(self, key: str) -> Any:
            # Acts as an adaptor for dict accesses from introspection.to_xml()
            assert self._description is not None
            return self._description[key]

    class Property(_Member):
        """Defines a D-Bus property on an interface

        There are two main ways to define properties: with and without getters.
        If you define a property without a getter, then you must provide a
        value (via the value= kwarg).  In this case, the property value is
        maintained internally and can be accessed from Python in the usual way.
        Change signals are sent automatically.

            class MyObject(bus.Object):
                counter = bus.Interface.Property('i', value=0)

            a = MyObject()
            a.counter = 5
            a.counter += 1
            print(a.counter)

        The other way to define properties is with a getter function.  In this
        case, you can read from the property in the normal way, but not write
        to it.  You are responsible for emitting change signals for yourself.
        You must not provide the value= kwarg.

            class MyObject(bus.Object):
                _counter = 0

                counter = bus.Interface.Property('i')
                @counter.getter
                def get_counter(self):
                    return self._counter

                @counter.setter
                def set_counter(self, value):
                    self._counter = value
                    self.property_changed('Counter')

        In either case, you can provide a setter function.  This function has
        no impact on Python code, but makes the property writable from the view
        of D-Bus.  Your setter will be called when a Properties.Set() call is
        made, and no other action will be performed.  A trivial implementation
        might look like:

            class MyObject(bus.Object):
                counter = bus.Interface.Property('i', value=0)
                @counter.setter
                def set_counter(self, value):
                    # we got a request to set the counter from D-Bus
                    self.counter = value

        In all cases, the first (and only mandatory) argument to the
        constructor is the D-Bus type of the property.

        Your getter and setter functions can be provided by kwarg to the
        constructor.  You can also give a name= kwarg to override the default
        name conversion scheme.
        """
        _category = 'properties'

        _getter: Optional[Callable[[Any], Any]]
        _setter: Optional[Callable[[Any, Any], None]]
        _type: bustypes.Type
        _value: Any

        def __init__(self, type_string: str,
                     value: Any = None,
                     name: Optional[str] = None,
                     getter: Optional[Callable[[Any], Any]] = None,
                     setter: Optional[Callable[[Any, Any], None]] = None):
            assert value is None or getter is None, 'A property cannot have both a value and a getter'

            super().__init__(name=name)
            self._getter = getter
            self._setter = setter
            self._type, = bustypes.from_signature(type_string)
            self._value = value

        def _describe(self) -> Dict[str, Any]:
            return {'type': self._type.typestring, 'flags': 'r' if self._setter is None else 'w'}

        def __get__(self, obj: 'Object', cls: Optional[type] = None) -> Any:
            assert self._name is not None
            if obj is None:
                return self
            if self._getter is not None:
                return self._getter.__get__(obj, cls)()
            elif self._value is not None:
                if obj._dbus_property_values is not None:
                    return obj._dbus_property_values.get(self._name, self._value)
                else:
                    return self._value
            else:
                raise AttributeError(f"'{obj.__class__.__name__}' property '{self._python_name}' "
                                     f"was not properly initialised: use either the 'value=' kwarg or "
                                     f"the @'{self._python_name}.getter' decorator")

        def __set__(self, obj: 'Object', value: Any) -> None:
            assert self._name is not None
            if self._getter is not None:
                raise AttributeError(f"Cannot directly assign '{obj.__class__.__name__}' "
                                     "property '{self._python_name}' because it has a getter")
            if obj._dbus_property_values is None:
                obj._dbus_property_values = {}
            obj._dbus_property_values[self._name] = value
            if obj._dbus_bus is not None:
                obj.properties_changed(self._interface, {self._name: bustypes.Variant(value, self._type)}, [])

        def to_dbus(self, obj: 'Object') -> bustypes.Variant:
            return bustypes.Variant(self.__get__(obj), self._type)

        def from_dbus(self, obj: 'Object', value: bustypes.Variant) -> None:
            if self._setter is None or self._type != value.type:
                raise Object.Method.Unhandled
            self._setter.__get__(obj)(value.value)

        def getter(self, getter: Callable[[Any], Any]) -> Callable[[Any], Any]:
            if self._value is not None:
                raise ValueError('A property cannot have both a value and a getter')
            if self._getter is not None:
                raise ValueError('This property already has a getter')
            self._getter = getter
            return getter

        def setter(self, setter: Callable[[Any, Any], None]) -> Callable[[Any, Any], None]:
            self._setter = setter
            return setter

    class Signal(_Member):
        """Defines a D-Bus signal on an interface

        This is a callable which will result in the signal being emitted.

        The constructor takes the types of the arguments, each one as a
        separate parameter.  For example:

            properties_changed = Interface.Signal('s', 'a{sv}', 'as')

        You can give a name= kwarg to override the default name conversion
        scheme.
        """
        _category = 'signals'
        _type: bustypes.MessageType

        def __init__(self, *out_types: str, name: Optional[str] = None) -> None:
            super().__init__(name=name)
            self._type = bustypes.MessageType(out_types)

        def _describe(self) -> Dict[str, Any]:
            return {'in': self._type.typestrings}

        def __get__(self, obj: 'Object', cls: Optional[type] = None) -> Callable[..., None]:
            def emitter(obj: Object, *args: Any) -> None:
                assert self._interface is not None
                assert self._name is not None
                assert obj._dbus_bus is not None
                assert obj._dbus_path is not None
                message = obj._dbus_bus.message_new_signal(obj._dbus_path, self._interface, self._name)
                self._type.write(message, *args)
                message.send()
            return emitter.__get__(obj, cls)

    class Method(_Member):
        """Defines a D-Bus method on an interface

        This is a function decorator which marks a given method for export.

        The constructor takes two arguments: the type of the output arguments,
        and the type of the input arguments.  Both should be given as a
        sequence.

            @Interface.Method(['a{sv}'], ['s'])
            def get_all(self, interface):
                ...

        You can give a name= kwarg to override the default name conversion
        scheme.
        """
        _category = 'methods'

        class Unhandled(Exception):
            """Raised by a method to indicate that the message triggering that
            method call remains unhandled."""
            pass

        def __init__(self, out_types: Sequence[str] = (), in_types: Sequence[str] = (), name: Optional[str] = None):
            super().__init__(name=name)
            self._out_type = bustypes.MessageType(out_types)
            self._in_type = bustypes.MessageType(in_types)
            self._func = None

        def __get__(self, obj, cls=None):
            return self._func.__get__(obj, cls)

        def __call__(self, *args, **kwargs):
            # decorator
            self._func, = args
            return self

        def _describe(self) -> Dict[str, Any]:
            return {'in': [item.typestring for item in self._in_type.item_types],
                    'out': [item.typestring for item in self._out_type.item_types]}

        def _invoke(self, obj, message):
            args = self._in_type.read(message)
            if args is None:
                return False
            try:
                result = self._func.__get__(obj)(*args)
            except (BusError, OSError) as error:
                return message.reply_method_error(error)

            return message.reply_method_function_return_value(self._out_type, result)


class org_freedesktop_DBus_Peer(Interface):
    @Interface.Method()
    @staticmethod
    def ping() -> None:
        pass

    @Interface.Method('s')
    @staticmethod
    def get_machine_id() -> str:
        with open('/etc/machine-id', encoding='ascii') as file:
            return file.read().strip()


class org_freedesktop_DBus_Introspectable(Interface):
    @Interface.Method('s')
    @classmethod
    def introspect(cls) -> str:
        return introspection.to_xml(cls._dbus_interfaces)


class org_freedesktop_DBus_Properties(Interface):
    properties_changed = Interface.Signal('s', 'a{sv}', 'as')

    @Interface.Method('v', 'ss')
    def get(self, interface, name):
        return self._find_member(interface, 'properties', name).to_dbus(self)

    @Interface.Method(['a{sv}'], 's')
    def get_all(self, interface):
        properties = self._find_category(interface, 'properties')
        return {name: prop.to_dbus(self) for name, prop in properties.items()}

    @Interface.Method('', 'ssv')
    def set(self, interface, name, value):
        self._find_member(interface, 'properties', name).from_dbus(self, value)


class Object(org_freedesktop_DBus_Introspectable,
             org_freedesktop_DBus_Peer,
             org_freedesktop_DBus_Properties,
             BaseObject,
             Interface):
    """High-level base class for exporting objects on D-Bus

    This is usually where you should start.

    This provides a base for exporting objects on the bus, implements the
    standard D-Bus interfaces, and allows you to add your own interfaces to the
    mix.  See the documentation for Interface to find out how to define and
    implement your D-Bus interface.
    """
    def message_received(self, message: BusMessage) -> bool:
        interface = message.get_interface()
        name = message.get_member()

        try:
            method = self._find_member(interface, 'methods', name)
            assert isinstance(method, Interface.Method)
            return method._invoke(self, message)
        except Object.Method.Unhandled:
            return False
